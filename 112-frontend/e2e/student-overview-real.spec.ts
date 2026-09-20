import { expect, test } from "@playwright/test";

test("student dashboard and teacher profile share real progress and performance", async ({
  page,
  request,
}, info) => {
  test.skip(
    process.env.AUTH_ISOLATED_API !== "true",
    "Disposable database required",
  );
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  page.setDefaultTimeout(10000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const call = async (
    path: string,
    token = "",
    data?: unknown,
    method?: string,
  ) => {
    const response = await request.fetch(`/api/v1/${path}`, {
      method: method ?? (data === undefined ? "GET" : "POST"),
      headers: { Authorization: `Bearer ${token}` },
      data,
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.status() === 204 ? null : response.json();
  };
  const admin = (
    await call("auth/login", "", {
      username: "admin",
      password: "isolated-admin-password-2026",
    })
  ).access_token;
  const suffix = Date.now();
  const password = "student-profile-browser-test";
  const makeUser = async (role: string) => {
    const user = await call("users", admin, {
      username: `${role}-profile-${suffix}`,
      initial_password: password,
      role,
      first_name: "Александр",
      last_name: role === "student" ? "Иванов" : "Петров",
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
  const classifier = await call("admin/classifiers", admin, {
    label: `Профиль ${suffix}`,
    source_filename: "profile.json",
    entries: [
      {
        code: "PROFILE.01",
        section: "Учебные",
        name: "Консультация",
        notification_required: false,
        service_ids: [],
      },
    ],
  });
  await call(`admin/classifiers/${classifier.id}/publish`, admin, {});
  const entry = (
    await call(`classifiers/${classifier.id}/entries`, teacher.token)
  )[0];
  const card = await call("cards", teacher.token, {
    title: "Консультация заявителя",
    classifier_version_id: classifier.id,
    classifier_entry_id: entry.id,
    caller_message: "Учебная консультация по адресу Учебная улица, 7.",
    data: { address_text: "Учебная улица, 7", description: "Консультация" },
    recipient_service_ids: [],
  });
  const scenario = await call("scenarios", teacher.token, {
    title: "Приём обращения 112",
    role: "operator_112",
    card_ids: [card.id],
  });
  const group = await call("groups", teacher.token, {
    name: `Учебная группа ${suffix}`,
  });
  await call(
    `groups/${group.id}/students/${student.id}`,
    teacher.token,
    undefined,
    "PUT",
  );
  const assign = (title: string, available_from?: string) =>
    call("lessons/start", teacher.token, {
      request_id: crypto.randomUUID(),
      group_id: group.id,
      scenario_version_id: scenario.id,
      title,
      available_from,
    });
  const start = async (lesson: { id: string }) => {
    const work = await call(`student/lessons/${lesson.id}`, student.token);
    return call(
      `student/assignments/${work.assignments[0].id}/start`,
      student.token,
      {},
    );
  };
  const active = await assign("Незаконченный урок");
  const attempt = await start(active);
  await call(
    `student/attempts/${attempt.id}/card`,
    student.token,
    {
      revision: attempt.card.revision,
      classifier_entry_id: entry.id,
      data: {
        address_text: "Учебная улица, 7",
        description: "Мой сохранённый черновик",
      },
    },
    "PUT",
  );
  await assign("Новое занятие");
  await assign(
    "Завтрашний урок",
    new Date(Date.now() + 86400000).toISOString(),
  );
  for (let score = 0; score <= 5; score++) {
    const lesson = await assign(`Практика ${score + 1}`);
    const current = await start(lesson);
    const filled = await call(
      `student/attempts/${current.id}/card`,
      student.token,
      {
        revision: current.card.revision,
        classifier_entry_id: entry.id,
        data: { address_text: "Учебная улица, 7", description: "Консультация" },
      },
      "PUT",
    );
    await call(`student/attempts/${current.id}/submit`, student.token, {
      revision: filled.card.revision,
    });
    const grade = await call(
      `student/lessons/${lesson.id}/evaluation`,
      student.token,
    );
    await call(
      `lessons/${lesson.id}/students/${student.id}/evaluations`,
      teacher.token,
      {
        request_id: crypto.randomUUID(),
        expected_revision: grade.revision,
        score,
        max_score: 5,
        comment: "Учебная проверка",
      },
    );
  }
  const login = async (username: string) => {
    await page.goto("/login");
    await page.getByLabel("Логин", { exact: true }).fill(username);
    await page.getByLabel("Пароль", { exact: true }).fill(password + "-final");
    await page.getByRole("button", { name: "Войти", exact: true }).click();
  };
  await login(student.username);
  await expect(page).toHaveURL(/student$/);
  const activeRegion = page.getByRole("region", { name: "Активные уроки 2" });
  await expect(activeRegion.getByRole("link")).toHaveCount(2);
  await expect(activeRegion.getByRole("link").first()).toContainText(
    "Незаконченный урок",
  );
  await expect(
    page.getByRole("img", { name: "Текущая успеваемость: 60%" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Общая успеваемость: 50%" }),
  ).toBeVisible();
  const table = page.getByRole("table", { name: "Учебные занятия" });
  await expect(table).toContainText("0%");
  await expect(table.getByRole("img")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("student-dashboard.png"),
    fullPage: true,
    animations: "disabled",
  });
  // The entire active lesson block resumes the existing attempt and its draft.
  await activeRegion
    .getByRole("link")
    .first()
    .click({ position: { x: 8, y: 8 } });
  await expect(page).toHaveURL(`/student/sessions/${active.id}`);
  await page.getByRole("button", { name: "Продолжить заполнение" }).click();
  await expect(
    page.getByLabel("Сообщение со слов заявителя", { exact: true }),
  ).toHaveValue("Мой сохранённый черновик");
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.goto("/student");
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await login(teacher.username);
  await expect(page).toHaveURL(/teacher$/);
  await page.goto("/groups");
  await page.getByRole("button", { name: group.name, exact: true }).click();
  await page
    .getByRole("button", { name: "Иванов Александр · Профиль" })
    .click();
  const modal = page.getByRole("dialog", { name: "Профиль ученика" });
  await expect(modal).toContainText("60%");
  await expect(modal).toContainText("50%");
  await expect(modal.getByRole("table")).toHaveCount(0);
  await expect(modal.getByRole("img")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("student-profile-summary.png"),
    fullPage: true,
    animations: "disabled",
  });
  await modal.getByRole("link", { name: "Подробнее", exact: true }).click();
  await expect(page).toHaveURL(`/teacher/students/${student.id}`);
  await expect(
    page.getByRole("img", { name: "Общая успеваемость: 50%" }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Учебные занятия" }).getByRole("row"),
  ).toHaveCount(10);
  await expect(page.getByRole("link", { name: /Продолжить урок/ })).toHaveCount(
    0,
  );
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать отчёт ученика XLSX" })
    .click();
  expect((await download).suggestedFilename()).toBe("student-report.xlsx");
  await page.screenshot({
    path: info.outputPath("student-profile-teacher.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 768, height: 1024 });
  // Metric content must remain inside its card on narrow screens.
  for (const metric of await page.locator(".student-performance-card").all()) {
    expect(
      await metric.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: info.outputPath("student-profile-tablet.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
