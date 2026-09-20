import { expect, test } from "@playwright/test";

test("BPMN: comments, separate proctoring, automatic deadline and administration history", async ({
  page,
  request,
}, info) => {
  test.skip(
    process.env.AUTH_ISOLATED_API !== "true",
    "Disposable database required",
  );
  test.setTimeout(90000);
  page.setDefaultTimeout(10000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const call = async (path: string, token: string, data?: unknown) => {
    const response = await request.fetch(`/api/v1/${path}`, {
      method: data === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}` },
      data,
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const admin = (
    await call("auth/login", "", {
      username: "admin",
      password: "isolated-admin-password-2026",
    })
  ).access_token;
  const suffix = Date.now();
  const password = "bpmn-browser-test-password";
  const makeUser = async (role: string) => {
    const user = await call("users", admin, {
      username: `${role}-bpmn-${suffix}`,
      initial_password: password,
      role,
      first_name: "Тест",
      last_name: role === "student" ? "Ученик" : "Преподаватель",
    });
    const login = await call("auth/login", "", {
      username: user.username,
      password,
    });
    const auth = await call("auth/change-password", login.access_token, {
      current_password: password,
      new_password: password + "-final",
    });
    return { ...user, token: auth.access_token };
  };
  const teacher = await makeUser("teacher");
  const student = await makeUser("student");
  const service = await call("admin/services", admin, {
    code: `bpmn${suffix}`,
    name: "Учебная служба BPMN",
  });
  const classifier = await call("admin/classifiers", admin, {
    label: `BPMN ${suffix}`,
    source_filename: "bpmn.json",
    entries: [
      {
        code: "B001",
        section: "Учебные",
        name: "Дерево упало",
        service_ids: [service.id],
      },
    ],
  });
  await call(`admin/classifiers/${classifier.id}/publish`, admin, {});
  const entry = (
    await call(`classifiers/${classifier.id}/entries`, teacher.token)
  )[0];
  const card = await call("cards", teacher.token, {
    title: "Учебное дерево",
    classifier_version_id: classifier.id,
    classifier_entry_id: entry.id,
    caller_message: "На Учебной улице, дом 7, упало дерево.",
    data: { address_text: "Учебная улица, 7", description: "Дерево упало" },
    recipient_service_ids: [service.id],
  });
  const scenario = await call("scenarios", teacher.token, {
    title: "Сценарий BPMN",
    role: "operator_112",
    card_ids: [card.id, card.id],
  });
  const group = await call("groups", teacher.token, {
    name: `Группа BPMN ${suffix}`,
  });
  expect(
    (
      await request.put(`/api/v1/groups/${group.id}/students/${student.id}`, {
        headers: { Authorization: `Bearer ${teacher.token}` },
      })
    ).ok(),
  ).toBeTruthy();
  const login = async (username: string, pass: string) => {
    await page.goto("/login");
    await page.getByLabel("Логин", { exact: true }).fill(username);
    await page.getByLabel("Пароль", { exact: true }).fill(pass);
    await page.getByRole("button", { name: "Войти", exact: true }).click();
  };
  await login(teacher.username, password + "-final");
  await expect(page).toHaveURL(/teacher$/);
  await page.goto("/groups");
  await page.getByRole("button", { name: group.name, exact: true }).click();
  await page
    .getByLabel("Объявление для группы")
    .fill("Проверяйте адрес перед оповещением.");
  await page.getByRole("button", { name: "Отправить комментарий" }).click();
  await expect(page.getByText("Отправлено. Получателей: 1")).toBeVisible();
  await page.screenshot({
    path: info.outputPath("bpmn-group.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: /Ученик Тест · Подробнее/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Профиль ученика" }),
  ).toBeVisible();
  await page
    .getByLabel("Комментарий ученику")
    .fill("Индивидуальная рекомендация.");
  await page
    .getByRole("dialog", { name: "Профиль ученика" })
    .getByRole("button", { name: "Отправить комментарий" })
    .click();
  await page.screenshot({
    path: info.outputPath("bpmn-profile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/training");
  await page.screenshot({
    path: info.outputPath("bpmn-assignment.png"),
    fullPage: true,
    animations: "disabled",
  });
  const lesson = await call("lessons/start", teacher.token, {
    request_id: crypto.randomUUID(),
    group_id: group.id,
    scenario_version_id: scenario.id,
    available_until: new Date(Date.now() + 25000).toISOString(),
  });
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await login(student.username, password + "-final");
  await expect(page).toHaveURL(/student$/);
  await expect(
    page.getByText("Проверяйте адрес перед оповещением."),
  ).toBeVisible();
  await page.goto(`/student/sessions/${lesson.id}`);
  await expect(
    page.getByText(/Учебные действия ведутся в отдельном журнале/),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("bpmn-start.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Приступить к заданию" }).click();
  await page.getByRole("button", { name: "Подтвердить начало" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Улица", { exact: true }).fill("Учебная улица");
  await dialog.getByLabel("Дом/Вл", { exact: true }).fill("7");
  await dialog
    .getByLabel("Сообщение со слов заявителя", { exact: true })
    .fill("Дерево упало");
  await expect
    .poll(async () => {
      const work = await call(`student/lessons/${lesson.id}`, student.token);
      const attempt = await call(
        `student/attempts/${work.assignments[0].attempt_id}`,
        student.token,
      );
      return attempt.card.data.description;
    })
    .toBe("Дерево упало");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.screenshot({
    path: info.outputPath("bpmn-arm.png"),
    fullPage: true,
    animations: "disabled",
  });
  const work = await call(`student/lessons/${lesson.id}`, student.token);
  const attemptId = work.assignments[0].attempt_id;
  await expect
    .poll(
      async () =>
        (await call(`teaching/attempts/${attemptId}/proctoring`, teacher.token))
          .total,
    )
    .toBeGreaterThan(0);
  await expect
    .poll(
      async () =>
        (await call(`student/lessons/${lesson.id}`, student.token)).status,
      { timeout: 35000 },
    )
    .toBe("finished");
  const grade = await call(
    `student/lessons/${lesson.id}/evaluation`,
    student.token,
  );
  expect(grade.assessment_details.missed_cards).toBe(1);
  expect(Number(grade.score)).toBeLessThan(51);
  const attempt = await call(`student/attempts/${attemptId}`, student.token);
  expect(attempt.status).toBe("interrupted");
  expect(attempt.notified_services).toEqual([]);
  await page.goto(`/results/${lesson.id}`);
  await expect(
    page.getByRole("heading", { name: /Автоматическая оценка/ }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("bpmn-result.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await login("admin", "isolated-admin-password-2026");
  await expect(page).toHaveURL(/admin$/);
  await page.goto("/users");
  await page.getByLabel("Поиск пользователя").fill(student.username);
  await page
    .getByRole("button", { name: new RegExp(`\\(${student.username}\\)`) })
    .click();
  await page
    .getByRole("button", { name: "История действий", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "История действий пользователя" }),
  ).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать XLSX", exact: true }).click();
  expect((await downloaded).suggestedFilename()).toBe("user-activity.xlsx");
  await page.screenshot({
    path: info.outputPath("bpmn-activity.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
