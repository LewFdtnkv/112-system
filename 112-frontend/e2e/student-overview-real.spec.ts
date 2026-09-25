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
  const profileOpened = page.waitForEvent("popup");
  await modal.getByRole("link", { name: "Подробнее", exact: true }).click();
  const profilePage = await profileOpened;
  profilePage.on("pageerror", (error) => errors.push(error.message));
  await expect(page).toHaveURL("/groups");
  await expect(modal).toBeVisible();
  await expect(profilePage).toHaveURL(`/teacher/students/${student.id}`);
  await expect(
    profilePage.getByRole("img", { name: "Общая успеваемость: 50%" }),
  ).toBeVisible();
  await expect(
    profilePage.getByRole("table", { name: "Учебные занятия" }).getByRole("row"),
  ).toHaveCount(10);
  await expect(
    profilePage.getByRole("link", { name: /Продолжить урок/ }),
  ).toHaveCount(0);
  const download = profilePage.waitForEvent("download");
  await profilePage
    .getByRole("button", { name: "Скачать отчёт ученика XLSX" })
    .click();
  expect((await download).suggestedFilename()).toBe("student-report.xlsx");
  await profilePage.screenshot({
    path: info.outputPath("student-profile-teacher.png"),
    fullPage: true,
    animations: "disabled",
  });
  await profilePage.setViewportSize({ width: 768, height: 1024 });
  // Metric content must remain inside its card on narrow screens.
  for (const metric of await profilePage
    .locator(".student-performance-card")
    .all()) {
    expect(
      await metric.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
  }
  await profilePage.screenshot({
    path: info.outputPath("student-profile-tablet.png"),
    fullPage: true,
    animations: "disabled",
  });

  await profilePage.close();

  // Mixed lesson types use the same server filter in both accounts.
  const service = await call("admin/services", admin, {
    code: `profile-dds-${suffix}`,
    name: "Учебная пожарная служба",
    short_name: "Служба 101",
  });
  const profile = await call("admin/service-profiles", admin, {
    service_id: service.id,
    name: "Учебная ДДС",
    responsibility: "Учебная территория",
  });
  await call(`admin/service-profiles/${profile.id}/publish`, admin, {});
  const ddsClassifier = await call("admin/classifiers", admin, {
    label: `ДДС ${suffix}`,
    source_filename: "dds.json",
    entries: [
      {
        code: "DDS.01",
        section: "Учебные",
        name: "Пожар",
        service_ids: [service.id],
      },
    ],
  });
  await call(`admin/classifiers/${ddsClassifier.id}/publish`, admin, {});
  const ddsEntry = (
    await call(`classifiers/${ddsClassifier.id}/entries`, teacher.token)
  )[0];
  const ddsCard = await call("cards", teacher.token, {
    title: "Карточка для учебной ДДС",
    classifier_version_id: ddsClassifier.id,
    classifier_entry_id: ddsEntry.id,
    data: { address_text: "Учебная улица, 7", description: "Учебная ситуация" },
    recipient_service_ids: [service.id],
  });
  const dds = await call("scenarios", teacher.token, {
    title: "Приём карточки в ДДС",
    role: "dds",
    service_profile_id: profile.id,
    card_ids: [ddsCard.id],
    dds_policy: {
      steps: [{ status: "accepted", message: "Примите учебную карточку." }],
    },
  });
  await call("lessons/start", teacher.token, {
    request_id: crypto.randomUUID(),
    group_id: group.id,
    scenario_version_id: dds.id,
    title: "Практика диспетчера",
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  const chooseType = async (label: string) => {
    await page
      .getByRole("combobox", { name: "Тип занятия", exact: true })
      .click();
    await page.getByRole("option", { name: label, exact: true }).click();
  };
  for (const actor of ["teacher", "student"]) {
    if (actor === "student") {
      await page.getByRole("button", { name: "Выйти", exact: true }).click();
      await login(student.username);
    } else {
      await page.goto("/sessions");
    }
    await expect(table.getByRole("row")).toHaveCount(11);
    await expect(
      table.getByRole("columnheader", { name: "Тип занятия" }),
    ).toBeVisible();
    await expect(
      table.getByRole("columnheader", { name: "Завершено (МСК)" }),
    ).toBeVisible();
    const completed = table.getByRole("row").filter({ hasText: "Практика 1" });
    const finishedAt = (
      await call("views/student/lessons?status=submitted", student.token)
    ).items.find(
      (row: { title: string }) => row.title === "Практика 1",
    ).completed_at;
    await expect(completed.locator("time")).toHaveAttribute(
      "datetime",
      finishedAt,
    );
    await expect(completed.locator("time")).toHaveText(
      new Date(finishedAt).toLocaleString("ru-RU", {
        timeZone: "Europe/Moscow",
        dateStyle: "short",
        timeStyle: "short",
      }),
    );
    await expect(
      table
        .getByRole("row")
        .filter({ hasText: "Практика диспетчера" })
        .getByRole("cell", { name: "—", exact: true }),
    ).toBeVisible();
    await table.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`lessons-${actor}.png`),
      animations: "disabled",
    });
    await chooseType("ДДС");
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(table).toContainText("Практика диспетчера");
    await expect(table).not.toContainText("Оператор 112");
    await page.screenshot({
      path: info.outputPath(`lessons-${actor}-dds.png`),
      animations: "disabled",
    });
    await chooseType("Оператор 112");
    await expect(table.getByRole("row")).toHaveCount(10);
    await expect(table).not.toContainText("Практика диспетчера");
    await chooseType("Все типы");
    await expect(table.getByRole("row")).toHaveCount(11);
  }
  expect(errors).toEqual([]);
});
