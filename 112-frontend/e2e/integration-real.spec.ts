import { expect, test, type Page } from "@playwright/test";
async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(username);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
}
async function change(page: Page, old: string, password: string) {
  await expect(page).toHaveURL(/change-password$/);
  await page.getByLabel("Текущий пароль", { exact: true }).fill(old);
  await page.getByLabel("Новый пароль", { exact: true }).fill(password);
  await page
    .getByLabel("Повторите новый пароль", { exact: true })
    .fill(password);
  await page.getByRole("button", { name: "Сохранить пароль" }).click();
}
async function select(page: Page, label: string, text: string) {
  await page.getByRole("combobox", { name: label, exact: true }).fill(text);
  await page.getByRole("option").filter({ hasText: text }).first().click();
}
test("real API: authoring, operator drafts, revision conflict, notification and teacher evaluation", async ({
  page,
  request,
}, info) => {
  test.skip(
    process.env.AUTH_ISOLATED_API !== "true",
    "Requires a disposable migrated database",
  );
  test.setTimeout(180000);
  page.setDefaultTimeout(10000);
  await page.setViewportSize({ width: 1920, height: 964 });
  page.on("dialog", (d) => void d.accept());
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const suffix = Date.now().toString();
  const teacher = `teach${suffix}`;
  const student = `stud${suffix}`;
  const initial = "integration-initial-password";
  const final = "integration-final-password";
  const adminPassword = "isolated-admin-password-2026";
  let auth = await request.post("/api/v1/auth/login", {
    data: { username: "admin", password: adminPassword },
  });
  if (auth.status() === 401) {
    const first = await request.post("/api/v1/auth/login", {
      data: { username: "admin", password: "admin" },
    });
    expect(first.ok()).toBeTruthy();
    const tokens = await first.json();
    auth = await request.post("/api/v1/auth/change-password", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      data: { current_password: "admin", new_password: adminPassword },
    });
  }
  expect(auth.ok()).toBeTruthy();
  await login(page, "admin", adminPassword);
  await expect(page).toHaveURL(/admin$/);
  await page.goto("/users");
  for (const [username, lastName, isTeacher] of [
    [teacher, "Преподаватель", true],
    [student, "Ученик", false],
  ] as const) {
    await page
      .getByRole("button", { name: "Создать пользователя", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("textbox", { name: "Логин", exact: true })
      .fill(username);
    await dialog.getByLabel("Стартовый пароль").fill(initial);
    await dialog.getByLabel("Фамилия", { exact: true }).fill(lastName + suffix);
    await dialog.getByLabel("Имя", { exact: true }).fill("Тест");
    if (isTeacher) {
      await dialog.getByRole("combobox", { name: "Роль пользователя" }).click();
      await page
        .getByRole("option", { name: "Преподаватель", exact: true })
        .click();
    }
    await dialog.getByRole("button", { name: "Создать аккаунт" }).click();
    await expect(dialog).not.toBeVisible();
  }
  await page.getByLabel("Поиск пользователя", { exact: true }).fill(student);
  // Administration details use the real profile and revoke access on disable.
  await page
    .getByRole("button", { name: new RegExp(`\\(${student}\\)`) })
    .click();
  let account = page.getByRole("dialog");
  await expect(
    account.getByText("Последний вход: Ещё не входил"),
  ).toBeVisible();
  await account.getByLabel("Аккаунт активен").uncheck();
  await account.getByRole("button", { name: "Сохранить изменения" }).click();
  await page
    .getByLabel("Причина изменения доступа")
    .fill("Учебная проверка доступа");
  await page.getByRole("button", { name: "Подтвердить", exact: true }).click();
  await expect(account).not.toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: student }),
  ).toContainText("Отключён");
  await page
    .getByRole("button", { name: new RegExp(`\\(${student}\\)`) })
    .click();
  account = page.getByRole("dialog");
  await account.getByLabel("Аккаунт активен").check();
  await account
    .getByLabel("Email", { exact: true })
    .fill("student@example.test");
  await account.screenshot({
    path: info.outputPath("admin-user-details.png"),
    animations: "disabled",
  });
  await account.getByRole("button", { name: "Сохранить изменения" }).click();
  await page
    .getByLabel("Причина изменения доступа")
    .fill("Учебная проверка доступа");
  await page.getByRole("button", { name: "Подтвердить", exact: true }).click();
  await expect(account).not.toBeVisible();
  await page.goto("/catalogs");
  await page
    .getByRole("textbox", { name: "Код службы", exact: true })
    .fill(`test${suffix}`);
  await page
    .getByLabel("Полное наименование службы")
    .fill("Учебная пожарная служба");
  await page
    .getByRole("button", { name: "Создать службу", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: `test${suffix}`, exact: true }),
  ).toBeVisible();
  const row = page.getByRole("row").filter({
    has: page.getByRole("cell", { name: `test${suffix}`, exact: true }),
  });
  const serviceId = await row.locator("td").nth(2).innerText();
  const classifier = `ЕКП тест ${suffix}`;
  await page.getByLabel("JSON справочника").fill(
    JSON.stringify({
      label: classifier,
      source_filename: "browser-test.json",
      entries: [
        {
          code: "T001",
          section: "Учебные",
          name: "Учебный пожар",
          service_ids: [serviceId],
        },
      ],
    }),
  );
  await page.getByRole("button", { name: "Создать черновик ЕКП" }).click();
  const versionRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: classifier, exact: true }) });
  await versionRow.getByRole("button", { name: "Опубликовать" }).click();
  await expect(
    versionRow.getByRole("cell", { name: "Опубликована", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await login(page, teacher, initial);
  await change(page, initial, final);
  await expect(page).toHaveURL(/teacher$/);
  await page.goto("/groups");
  await page.getByLabel("Название группы").fill(`Группа ${suffix}`);
  await page
    .getByRole("button", { name: "Создать группу", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Группа ${suffix}`, exact: true })
    .click();
  await select(page, "Ученик", `Ученик${suffix}`);
  await page.getByRole("button", { name: "Добавить ученика" }).click();
  await expect(page.getByRole("dialog").getByRole("listitem")).toContainText(
    `Ученик${suffix}`,
  );
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.goto("/cards");
  await page
    .getByRole("button", { name: "Создать карточку", exact: true })
    .click();
  await page.getByLabel("Название карточки").fill(`Пожар ${suffix}`);
  await page
    .getByLabel("Сообщение заявителя для ученика")
    .fill("На Учебной улице, дом 7, дым из окна. Сообщает Иван Петров.");
  await page.getByLabel("Адрес целиком").fill("Учебная улица, д. 7");
  await page.getByLabel("Улица", { exact: true }).fill("Учебная улица");
  await page.getByLabel("Дом", { exact: true }).fill("7");
  await page.getByLabel("ФИО заявителя", { exact: true }).fill("Иван Петров");
  await expect(page.getByLabel("Адрес целиком")).toHaveValue(
    "Учебная улица, д. 7",
  );
  await page.getByLabel("Сообщение в карточке").fill("Дым из окна");
  await select(page, "Опубликованная версия ЕКП", classifier);
  await select(page, "Тип происшествия (ЕКП)", "Учебный пожар");
  await page.getByLabel("Улица", { exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole("dialog").screenshot({
    path: info.outputPath("template-address.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Сохранить карточку", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: `Пожар ${suffix}`, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Эталонное решение", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog").locator("dl")).toContainText(
    "Сведения об адресе / Улица",
  );
  await page.getByRole("dialog").screenshot({
    path: info.outputPath("template-details.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.goto("/scenarios/new");
  await page.getByLabel("Название сценария").fill(`Сценарий ${suffix}`);
  await page.getByLabel("Категория", { exact: true }).fill("Пожар");
  await select(page, "Карточка из библиотеки", `Пожар ${suffix}`);
  await page.getByRole("button", { name: "Добавить карточку" }).click();
  await select(page, "Карточка из библиотеки", `Пожар ${suffix}`);
  await page.getByRole("button", { name: "Добавить карточку" }).click();
  await page.getByLabel("Статус публикации").click();
  await page.getByRole("option", { name: "Опубликован", exact: true }).click();
  await page
    .getByText("Автоматическая оценка — веса критериев", { exact: true })
    .click();
  await expect(
    page.getByRole("spinbutton", { name: /Вес: Адрес/ }),
  ).toHaveValue("30");
  await page.screenshot({
    path: info.outputPath("scenario-assessment-policy.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Сохранить сценарий" }).click();
  await expect(page).toHaveURL(/scenarios$/);
  await page.goto("/training");
  await select(page, "Группа", `Группа ${suffix}`);
  await select(page, "Готовый сценарий", `Сценарий ${suffix}`);
  await page.getByRole("button", { name: "Назначить задание" }).click();
  await page.getByRole("button", { name: "Подтвердить назначение" }).click();
  await expect(page).toHaveURL(/training\/[\w-]+$/);
  const lessonId = page.url().split("/").at(-1)!;
  await page.screenshot({
    path: info.outputPath("teacher-monitor.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await login(page, student, initial);
  await change(page, initial, final);
  await expect(page).toHaveURL(/student$/);
  await page.goto(`/student/sessions/${lessonId}`);
  await page.getByRole("button", { name: "Приступить к заданию" }).click();
  await page.getByRole("button", { name: "Подтвердить начало" }).click();
  await page.getByRole("button", { name: "Начать следующую карточку" }).click();
  const card = page.getByRole("dialog");
  await expect(card).toBeVisible();
  await expect(
    card.getByText(
      "На Учебной улице, дом 7, дым из окна. Сообщает Иван Петров.",
    ),
  ).toBeVisible();
  await card.getByLabel("Улица", { exact: true }).fill("Учебная улица");
  await card.getByLabel("Дом/Вл", { exact: true }).fill("7");
  await card.getByLabel("Заявитель", { exact: true }).fill("Иван Петров");
  await card
    .getByLabel("Сообщение со слов заявителя", { exact: true })
    .fill("Дым из окна");
  await card.getByLabel("Тип происшествия", { exact: true }).fill("пожар");
  await card
    .getByRole("button", { name: "Учебный пожар", exact: true })
    .click();
  await expect(
    card.getByRole("button").filter({ hasText: "Учебная пожарная служба" }),
  ).toBeVisible();
  await card
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  await expect(card.getByText("Черновик сохранён на сервере.")).toBeVisible();
  await page.screenshot({
    path: info.outputPath("operator-card.png"),
    fullPage: true,
    animations: "disabled",
  });
  await card.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Продолжить заполнение" }).click();
  await expect(card.getByLabel("Улица", { exact: true })).toHaveValue(
    "Учебная улица",
  );
  await expect(
    card.getByLabel("Сообщение со слов заявителя", { exact: true }),
  ).toHaveValue("Дым из окна");
  // A second tab writes first; stale saving must preserve the current form.
  const tokens = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem("dds112-tokens-v1")!).state.tokens,
  );
  const headers = { Authorization: `Bearer ${tokens.access_token}` };
  const work = await (
    await request.get(`/api/v1/student/lessons/${lessonId}`, { headers })
  ).json();
  const attemptId = work.assignments[0].attempt_id;
  const attempt = await (
    await request.get(`/api/v1/student/attempts/${attemptId}`, { headers })
  ).json();
  await request.put(`/api/v1/student/attempts/${attemptId}/card`, {
    headers,
    data: {
      revision: attempt.card.revision,
      classifier_entry_id: attempt.card.classifier_entry_id,
      data: { ...attempt.card.data, caller_name: "Из другой вкладки" },
    },
  });
  await card
    .getByLabel("Заявитель", { exact: true })
    .fill("Сохранить этот ввод");
  await card
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  await expect(card.getByRole("alert")).toContainText("другой вкладке");
  await expect(card.getByLabel("Заявитель", { exact: true })).toHaveValue(
    "Сохранить этот ввод",
  );
  await card.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("button", { name: "Продолжить заполнение" }).click();
  await card
    .getByRole("button", { name: "Оповестить и сохранить карточку" })
    .click();
  await expect(
    card.getByText("Карточка передана на учебную проверку."),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("operator-view.png"),
    fullPage: true,
    animations: "disabled",
  });
  await card.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.screenshot({
    path: info.outputPath("operator-journal.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Начать следующую карточку" }).click();
  await card.getByLabel("Улица", { exact: true }).fill("Учебная улица");
  await card.getByLabel("Дом/Вл", { exact: true }).fill("7");
  await card
    .getByLabel("Сообщение со слов заявителя", { exact: true })
    .fill("Дым из окна");
  await card.getByLabel("Тип происшествия", { exact: true }).fill("пожар");
  await card
    .getByRole("button", { name: "Учебный пожар", exact: true })
    .click();
  await card
    .getByRole("button", { name: "Оповестить и сохранить карточку" })
    .click();
  await expect(
    card.getByText("Карточка передана на учебную проверку."),
  ).toBeVisible();
  await card.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.goto(`/results/${lessonId}`);
  await expect(
    page.getByRole("heading", {
      name: "Автоматическая оценка: 88.89 / 100.00",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("student-automatic-result.png"),
    fullPage: true,
  });
  const me = await (await request.get("/api/v1/users/me", { headers })).json();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await login(page, teacher, final);
  await expect(page).toHaveURL(/teacher$/);
  await page.goto(`/results/${lessonId}?student=${me.id}`);
  await expect(
    page.getByRole("heading", {
      name: "Автоматическая оценка: 88.89 / 100.00",
    }),
  ).toBeVisible();
  for (const button of await page
    .getByRole("button", { name: "Таблица", exact: true })
    .all())
    await button.click();
  const checks = page.getByRole("table", {
    name: "Автоматическая проверка полей",
  });
  await expect(checks).toHaveCount(2);
  await expect(
    checks.first().getByRole("row").filter({ hasText: "ФИО заявителя" }),
  ).toContainText("Расхождение");
  await expect(
    checks.nth(1).getByRole("row").filter({ hasText: "ФИО заявителя" }),
  ).toContainText("Не заполнено");
  await checks.first().screenshot({
    path: info.outputPath("automatic-check-fields.png"),
    animations: "disabled",
  });
  await page
    .getByText("Аудит действий ученика", { exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("table", { name: "Аудит действий", exact: true }),
  ).toContainText("Действие отклонено");
  await page.screenshot({
    path: info.outputPath("teacher-automatic-audit.png"),
    fullPage: true,
  });
  await page.getByText("Пересмотр преподавателем", { exact: true }).click();
  await page.getByRole("spinbutton", { name: "Балл", exact: true }).fill("85");
  await page
    .getByLabel("Комментарий преподавателя")
    .fill("Адрес и тип происшествия указаны верно.");
  await page.getByRole("button", { name: "Сохранить оценку" }).click();
  await expect(
    page.getByRole("heading", { name: "Оценка преподавателя: 85.00 / 100.00" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("teacher-review.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/analytics");
  await expect(page.getByText(/Средний результат: 85.0%/)).toBeVisible();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await login(page, student, final);
  await expect(page).toHaveURL(/student$/);
  await page.goto(`/results/${lessonId}`);
  await expect(
    page.getByRole("heading", { name: "Оценка преподавателя: 85.00 / 100.00" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("student-result.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
