import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(username);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
}
async function choose(page: Page, label: string, text: string) {
  await page.getByRole("combobox", { name: label, exact: true }).fill(text);
  await page.getByRole("option").filter({ hasText: text }).first().click();
}
test("real API: EKP file roundtrip, rule editing, profile publication and DDS exercise", async ({
  page,
  request,
}, info) => {
  test.skip(
    process.env.AUTH_ISOLATED_API !== "true",
    "Disposable database required",
  );
  test.setTimeout(180000);
  page.setDefaultTimeout(10000);
  await page.setViewportSize({ width: 1920, height: 964 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const suffix = Date.now().toString();
  const adminPassword = "isolated-admin-password-2026";
  let auth = await request.post("/api/v1/auth/login", {
    data: { username: "admin", password: adminPassword },
  });
  if (auth.status() === 401) {
    const initial = await request.post("/api/v1/auth/login", {
      data: { username: "admin", password: "admin" },
    });
    auth = await request.post("/api/v1/auth/change-password", {
      headers: {
        Authorization: `Bearer ${(await initial.json()).access_token}`,
      },
      data: { current_password: "admin", new_password: adminPassword },
    });
  }
  expect(auth.ok()).toBeTruthy();
  const admin = (await auth.json()).access_token;
  const call = async (
    method: string,
    path: string,
    token: string,
    data?: unknown,
  ) => {
    const response = await request.fetch(`/api/v1/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      data,
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const password = "catalog-dds-browser-password";
  const account = async (role: string) => {
    const username = `${role}${suffix}`;
    const user = await call("POST", "users", admin, {
      username,
      role,
      initial_password: password,
    });
    const first = await call("POST", "auth/login", admin, {
      username,
      password,
    });
    const changed = await call(
      "POST",
      "auth/change-password",
      first.access_token,
      { current_password: password, new_password: password + "-final" },
    );
    return { username, id: user.id, token: changed.access_token };
  };
  const teacher = await account("teacher");
  const student = await account("student");
  const label = `ЕКП браузер ${suffix}`;
  const fire = `fire${suffix}`,
    med = `med${suffix}`;
  const extraNames = [
    "Деп. ЖКХ",
    "ЦЭМП",
    "ЦОДД",
    "Мос. Без.",
    "Мослифт",
    "ОАТИ",
    "Поселение Вороновское",
    "Поселение ТиНАО",
  ];
  const extraServices = extraNames.map((name, i) => ({
    code: `extra${suffix}-${i}`,
    name: `Учебная служба: ${name}`,
    short_name: name,
  }));
  const document = {
    format: "system112-ekp-v1",
    label,
    services: [
      { code: fire, name: "Учебная пожарная служба", short_name: "Служба 101" },
      ...extraServices,
      { code: med, name: "Учебная скорая помощь" },
    ],
    entries: [
      {
        code: "101",
        section: "Пожары",
        name: "Пожар в учебном доме",
        response_scenario: "Учебное реагирование",
        features: [{ key: "victims", label: "Есть пострадавшие" }],
        routes: [
          { service_code: fire, is_main: true, when: {} },
          ...extraServices.map((s) => ({
            service_code: s.code,
            is_main: false,
            when: {},
          })),
          { service_code: med, is_main: false, when: { victims: true } },
        ],
      },
    ],
  };
  await login(page, "admin", adminPassword);
  await expect(page).toHaveURL(/admin$/);
  await page.goto("/catalogs");
  await page.getByLabel("Загрузить ЕКП JSON").setInputFiles({
    name: "ekp.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });
  await expect(page.getByText("Черновик ЕКП загружен")).toBeVisible();
  await page.getByRole("button", { name: label, exact: true }).click();
  await page
    .getByRole("button", { name: "Пожар в учебном доме", exact: true })
    .click();
  const rule = page.getByRole("dialog").last();
  await rule
    .getByRole("textbox", { name: "Название происшествия", exact: true })
    .fill("Пожар в жилом доме (учебный)");
  await rule.screenshot({
    path: info.outputPath("catalog-rule-editor.png"),
    animations: "disabled",
  });
  await rule.getByRole("button", { name: "Сохранить правило" }).click();
  await expect(
    page.getByRole("button", {
      name: "Пожар в жилом доме (учебный)",
      exact: true,
    }),
  ).toBeVisible();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать JSON", exact: true }).click();
  const download = await downloading;
  const file = info.outputPath("exported-ekp.json");
  await download.saveAs(file);
  const exported = JSON.parse(await readFile(file, "utf8"));
  expect(exported.entries[0].name).toBe("Пожар в жилом доме (учебный)");
  expect(exported.entries[0].routes).toEqual(
    document.entries[0].routes.toSorted((a, b) =>
      a.service_code.localeCompare(b.service_code),
    ),
  );
  await page.getByRole("button", { name: "Закрыть справочник" }).click();
  await page
    .getByRole("row")
    .filter({ hasText: label })
    .getByRole("button", { name: "Опубликовать", exact: true })
    .click();
  await expect(page.getByRole("row").filter({ hasText: label })).toContainText(
    "Опубликован",
  );
  await page
    .getByRole("button", { name: "Создать профиль службы", exact: true })
    .click();
  await choose(page, "Служба профиля", fire);
  const profileName = `ДДС пожарной службы ${suffix}`;
  await page
    .getByRole("textbox", { name: "Название профиля", exact: true })
    .fill(profileName);
  await page
    .getByRole("textbox", { name: "Зона ответственности", exact: true })
    .fill("Учебные объекты района Вороновское");
  await page
    .getByRole("textbox", {
      name: "Порядок действий и правила службы",
      exact: true,
    })
    .fill(
      "Проверьте принадлежность карточки, примите её и фиксируйте сообщения наряда.",
    );
  for (const [index, code, name] of [
    [1, "water", "Аварийная бригада"],
    [2, "reserve", "Резервная бригада"],
  ] as const) {
    await page
      .getByRole("button", { name: "Добавить бригаду", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: `Код бригады ${index}`, exact: true })
      .fill(code);
    await page
      .getByRole("textbox", { name: `Название бригады ${index}`, exact: true })
      .fill(name);
    await page
      .getByLabel(`Назначение бригады ${index}`, { exact: true })
      .fill("Учебное реагирование в районе Вороновское");
  }
  await page.getByRole("dialog").screenshot({
    path: info.outputPath("catalog-service-profile.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Сохранить профиль", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("row")
    .filter({ hasText: profileName })
    .getByRole("button", { name: "Опубликовать профиль" })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: profileName }),
  ).toContainText("Опубликован");
  const versions = await call(
    "GET",
    `classifiers?q=${encodeURIComponent(label)}`,
    teacher.token,
  );
  const version = versions[0];
  const entries = await call(
    "GET",
    `classifiers/${version.id}/entries`,
    teacher.token,
  );
  const services = await call("GET", `views/admin/services?q=${fire}`, admin);
  const fireId = services.items[0].id;
  const extraIds = (
    await call("GET", `views/admin/services?q=extra${suffix}`, admin)
  ).items.map((s: { id: string }) => s.id);
  const card = await call("POST", "cards", teacher.token, {
    title: `Пожар ${suffix}`,
    classifier_version_id: version.id,
    classifier_entry_id: entries[0].id,
    caller_message: "На Учебной улице, дом 1, пожар. Пострадавших нет.",
    data: {
      address_text: "Учебная улица, 1",
      address_details: {
        country: "Россия",
        region: "Москва",
        locality: "Вороновское",
        street: "Учебная",
        house: "1",
      },
      description: "Пожар в учебном доме",
      caller_name: "Учебный заявитель",
      features: { ekp: { victims: false } },
    },
    recipient_service_ids: [fireId, ...extraIds],
  });
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await login(page, teacher.username, password + "-final");
  await expect(page).toHaveURL(/teacher$/);
  await page.goto("/scenarios/new");
  await page
    .getByRole("textbox", { name: "Название сценария", exact: true })
    .fill(`ДДС сценарий ${suffix}`);
  await page
    .getByRole("combobox", { name: "Учебная роль", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Диспетчер ДДС", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Сообщение ученику на этапе 1", exact: true })
    .fill("Карточка относится к ответственности вашей службы. Примите её.");
  await page.getByRole("button", { name: "Добавить этап ДДС" }).click();
  await page
    .getByRole("textbox", { name: "Сообщение ученику на этапе 2", exact: true })
    .fill("Наряд УЧ-42 сообщил, что работы завершены.");
  await page
    .getByRole("textbox", {
      name: "Эталонный номер наряда на этапе 2",
      exact: true,
    })
    .fill("УЧ-42");
  await choose(page, "Профиль службы", profileName);
  await page
    .getByRole("combobox", {
      name: "Цель для бригады «Аварийная бригада»",
      exact: true,
    })
    .click();
  await page
    .getByRole("option", { name: "Работы завершены", exact: true })
    .click();
  await choose(page, "Карточка из библиотеки", card.title);
  await page
    .getByRole("button", { name: "Добавить карточку", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Статус публикации", exact: true })
    .click();
  await page.getByRole("option", { name: "Опубликован", exact: true }).click();
  await page.screenshot({
    path: info.outputPath("catalog-dds-scenario.png"),
    fullPage: true,
  });
  const scenarioResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/scenarios") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Сохранить сценарий", exact: true })
    .click();
  const scenarioResult = await scenarioResponse;
  expect(scenarioResult.ok(), await scenarioResult.text()).toBeTruthy();
  const scenario = await scenarioResult.json();
  const group = await call("POST", "groups", teacher.token, {
    name: `ДДС группа ${suffix}`,
  });
  await call("PUT", `groups/${group.id}/students/${student.id}`, teacher.token);
  const lesson = await call("POST", "lessons/start", teacher.token, {
    request_id: crypto.randomUUID(),
    group_id: group.id,
    scenario_version_id: scenario.id,
  });
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await login(page, student.username, password + "-final");
  await expect(page).toHaveURL(/student$/);
  await page.goto(`/student/sessions/${lesson.id}`);
  await page
    .getByRole("button", { name: "Приступить к заданию", exact: true })
    .click();
  await page.getByRole("button", { name: "Подтвердить начало" }).click();
  await expect(
    page.getByRole("button", { name: "Изменить статус ДДС" }),
  ).toBeVisible();
  await expect(
    page.getByText("Пожар в учебном доме", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Все службы (9)", exact: true })
    .click();
  await expect(page.getByLabel("Дополнительные службы")).toBeVisible();
  await page
    .getByLabel("Дополнительные службы")
    .getByRole("button")
    .first()
    .click();
  await expect(
    page.getByRole("button", {
      name: "Редактировать статус службы",
      exact: true,
    }),
  ).not.toBeVisible();
  await page.screenshot({
    path: info.outputPath("dds-services-expanded.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Свернуть службы", exact: true })
    .click();
  await page
    .locator(".dds-service-grid")
    .getByRole("button")
    .filter({ hasText: "Служба 101" })
    .click();
  for (const [status, comment] of [
    ["accepted", "Карточка принята"],
    ["completed", "Работы завершены"],
  ]) {
    await page.getByRole("button", { name: "Изменить статус ДДС" }).click();
    await page
      .getByRole("combobox", { name: "Статус реагирования", exact: true })
      .selectOption(status);
    if (status === "completed")
      await page
        .getByRole("textbox", { name: "Номер наряда", exact: true })
        .fill("УЧ-42");
    await page
      .getByRole("textbox", { name: "Комментарий ДДС", exact: true })
      .fill(comment);
    if (status === "completed")
      await page
        .getByRole("dialog")
        .last()
        .screenshot({
          path: info.outputPath("catalog-dds-status.png"),
          animations: "disabled",
        });
    await page
      .getByRole("button", { name: "Сохранить статус", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Комментарий ДДС", exact: true }),
    ).not.toBeVisible();
    if (status === "accepted") {
      for (const code of ["water", "reserve"]) {
        await page
          .getByRole("button", { name: "+ Назначить бригаду", exact: true })
          .click();
        await page
          .getByRole("combobox", { name: "Бригада", exact: true })
          .selectOption(code);
        await page
          .getByRole("textbox", { name: "Номер наряда", exact: true })
          .fill(code === "water" ? "23" : "24");
        await page
          .getByRole("textbox", { name: "Комментарий бригады", exact: true })
          .fill("Назначена по сведениям задания");
        await page
          .getByRole("button", { name: "Назначить бригаду", exact: true })
          .click();
        await expect(
          page.getByRole("textbox", {
            name: "Комментарий бригады",
            exact: true,
          }),
        ).not.toBeVisible();
      }
      await page
        .getByRole("button", { name: "Изменить статус бригады", exact: true })
        .click();
      await page
        .getByRole("combobox", { name: "Статус бригады", exact: true })
        .selectOption("cancelled");
      await page
        .getByRole("textbox", { name: "Комментарий бригады", exact: true })
        .fill("Резерв не требуется после уточнения");
      await page
        .getByRole("button", { name: "Сохранить статус", exact: true })
        .click();
      await expect(
        page.getByRole("textbox", { name: "Комментарий бригады", exact: true }),
      ).not.toBeVisible();
      await page
        .getByRole("button")
        .filter({ hasText: "Аварийная бригада" })
        .click();
      for (const crewStatus of [
        "responding",
        "arrived",
        "in_progress",
        "completed",
      ]) {
        await page
          .getByRole("button", { name: "Изменить статус бригады", exact: true })
          .click();
        await page
          .getByRole("combobox", { name: "Статус бригады", exact: true })
          .selectOption(crewStatus);
        await page
          .getByRole("textbox", { name: "Комментарий бригады", exact: true })
          .fill(
            {
              responding: "Старший сообщил: бригада выехала",
              arrived: "Бригада прибыла на место",
              in_progress: "Приступили к устранению аварии",
              completed: "Авария устранена, работы завершены",
            }[crewStatus] ?? crewStatus,
          );
        if (crewStatus === "in_progress")
          await page.screenshot({
            path: info.outputPath("dds-crew-editor.png"),
            animations: "disabled",
          });
        await page
          .getByRole("button", { name: "Сохранить статус", exact: true })
          .click();
        await expect(
          page.getByRole("textbox", {
            name: "Комментарий бригады",
            exact: true,
          }),
        ).not.toBeVisible();
      }
      await page.screenshot({ path: info.outputPath("dds-crews-desktop.png") });
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.screenshot({ path: info.outputPath("dds-crews-laptop.png") });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: info.outputPath("dds-crews-mobile.png") });
      await page.setViewportSize({ width: 1920, height: 964 });
    }
  }
  await page.screenshot({
    path: info.outputPath("catalog-dds-workplace.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Завершить упражнение", exact: true })
    .click();
  await expect(
    page.getByText("Упражнение завершено. Автоматическая оценка сохранена."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Закрыть карточку ДДС", exact: true })
    .click();
  await page.getByRole("link", { name: "Результат", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Автоматическая оценка: 100.00 / 100.00",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("catalog-dds-result.png"),
    fullPage: true,
  });
  // Conditional EKP answers change the recipients without rewriting the draft.
  const operator = await call("POST", "scenarios", teacher.token, {
    title: `Признаки ${suffix}`,
    role: "operator_112",
    card_ids: [card.id],
  });
  const operatorLesson = await call("POST", "lessons/start", teacher.token, {
    request_id: crypto.randomUUID(),
    group_id: group.id,
    scenario_version_id: operator.id,
  });
  await page.goto(`/student/sessions/${operatorLesson.id}`);
  await page
    .getByRole("button", { name: "Приступить к заданию", exact: true })
    .click();
  await page.getByRole("button", { name: "Подтвердить начало" }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Тип происшествия", { exact: true }).fill("101");
  await editor
    .getByRole("button", {
      name: "Пожар в жилом доме (учебный)",
      exact: true,
    })
    .click();
  await editor
    .getByRole("button", { name: "Есть пострадавшие: Да", exact: true })
    .click();
  await expect(
    editor
      .locator(".arm-service-tile")
      .filter({ hasText: "Учебная скорая помощь" }),
  ).toBeVisible();
  await editor
    .getByRole("button", { name: "Есть пострадавшие: Нет", exact: true })
    .click();
  await expect(
    editor
      .locator(".arm-service-tile")
      .filter({ hasText: "Учебная скорая помощь" }),
  ).not.toBeVisible();
  await expect(
    editor.locator(".arm-service-tile").filter({ hasText: "Служба 101" }),
  ).toBeVisible();
  await editor
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  await expect(editor.getByText("Черновик сохранён на сервере.")).toBeVisible();
  await page.screenshot({
    path: info.outputPath("catalog-operator-features.png"),
    animations: "disabled",
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Продолжить заполнение", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Есть пострадавшие: Нет", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.goto("/student");
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await login(page, teacher.username, password + "-final");
  await expect(page).toHaveURL(/teacher$/);
  await page.goto(`/results/${lesson.id}?student=${student.id}`);
  await expect(
    page.getByRole("region", { name: "Работа бригад" }),
  ).toContainText("Аварийная бригада");
  await expect(
    page.getByRole("region", { name: "Работа бригад" }),
  ).toContainText("Назначение отменено");
  await page.getByRole("region", { name: "Работа бригад" }).screenshot({
    path: info.outputPath("dds-crews-review.png"),
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
