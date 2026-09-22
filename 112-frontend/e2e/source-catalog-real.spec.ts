import { expect, test } from "@playwright/test";

test("source catalog: conditional 101 branches and stored student answers", async ({
  page,
  request,
  browser,
}, info) => {
  test.skip(
    process.env.AUTH_ISOLATED_API !== "true",
    "Disposable database required",
  );
  test.setTimeout(90000);
  page.setDefaultTimeout(10000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const suffix = Date.now().toString();
  const adminPassword = "isolated-admin-password-2026";
  let response = await request.post("/api/v1/auth/login", {
    data: { username: "admin", password: adminPassword },
  });
  if (response.status() === 401) {
    const initial = await request.post("/api/v1/auth/login", {
      data: { username: "admin", password: "admin" },
    });
    response = await request.post("/api/v1/auth/change-password", {
      headers: {
        Authorization: `Bearer ${(await initial.json()).access_token}`,
      },
      data: { current_password: "admin", new_password: adminPassword },
    });
  }
  expect(response.ok()).toBeTruthy();
  const admin = (await response.json()).access_token;
  const call = async (
    method: string,
    path: string,
    token: string,
    data?: unknown,
  ) => {
    const r = await request.fetch(`/api/v1/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      data,
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  const password = "popular-types-password";
  const account = async (role: string) => {
    const username = `${role}-types-${suffix}`;
    const user = await call("POST", "users", admin, {
      username,
      initial_password: password,
      first_name: "Тест",
      last_name: "Учебный",
      role,
    });
    const auth = await call("POST", "auth/login", "", { username, password });
    const final = await call(
      "POST",
      "auth/change-password",
      auth.access_token,
      { current_password: password, new_password: password + "-changed" },
    );
    return { user, username, token: final.access_token };
  };
  const teacher = await account("teacher"),
    student = await account("student");
  const catalog = (
    await call("GET", "views/admin/classifiers", admin)
  ).items.find((c: { label: string }) => c.label.startsWith("112 Москва"));
  const entries = await call(
    "GET",
    `classifiers/${catalog.id}/entries?limit=100`,
    teacher.token,
  );
  expect(entries).toHaveLength(51);
  const entry = entries.find((e: { name: string }) => e.name === "101");
  const services = (
    await call(
      "GET",
      "views/admin/services?q=" + encodeURIComponent("Служба 101"),
      admin,
    )
  ).items;
  const service = services.find(
    (s: { short_name: string }) => s.short_name === "Служба 101",
  );
  expect(
    (await call("GET", `admin/classifiers/${catalog.id}/export`, admin))
      .services,
  ).toHaveLength(211);
  const card = await call("POST", "cards", teacher.token, {
    title: "Пожар на улице — проверка веток 101",
    caller_message: "На улице горит мусор. Людей рядом нет.",
    classifier_version_id: catalog.id,
    classifier_entry_id: entry.id,
    recipient_service_ids: [service.id],
    data: {
      address_text: "Москва, улица Ленина, 10",
      description: "Горит мусор",
      features: {
        ekp: {
          where: "Улица",
          street_sign: "Открытое пламя / Дым",
          street_object: "Мусор",
        },
      },
    },
  });
  const scenario = await call("POST", "scenarios", teacher.token, {
    title: "Проверка 101",
    role: "operator_112",
    card_ids: [card.id],
  });
  const group = await call("POST", "groups", teacher.token, {
    name: "Проверка справочника",
  });
  await call(
    "PUT",
    `groups/${group.id}/students/${student.user.id}`,
    teacher.token,
  );
  const lesson = await call("POST", "lessons/start", teacher.token, {
    request_id: crypto.randomUUID(),
    group_id: group.id,
    scenario_version_id: scenario.id,
  });
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(student.username);
  await page.getByLabel("Пароль", { exact: true }).fill(password + "-changed");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/student$/);
  await page.goto(`/student/sessions/${lesson.id}`);
  await page
    .getByRole("button", { name: "Приступить к заданию", exact: true })
    .click();
  await page.getByRole("button", { name: "Подтвердить начало" }).click();
  const editor = page.getByRole("dialog");
  const input = editor.getByLabel("Тип происшествия", { exact: true });
  await input.fill("101");
  await editor
    .locator(".arm-category-results")
    .getByRole("button", { name: "101", exact: true })
    .click();
  const choose = (name: string) =>
    editor.getByRole("button", { name, exact: true }).click();
  await expect(
    editor.getByRole("button", {
      name: "Признак пожара (улица): Открытое пламя / Дым",
      exact: true,
    }),
  ).toHaveCount(0);
  await choose("Где: Улица");
  await choose("Признак пожара (улица): Открытое пламя / Дым");
  await choose("Улица (пламя, дым): Мусор");
  await editor.screenshot({
    path: info.outputPath("101-street.png"),
    animations: "disabled",
  });
  await choose("Где: Транспорт");
  await expect(
    editor.getByRole("button", {
      name: "Улица (пламя, дым): Мусор",
      exact: true,
    }),
  ).toHaveCount(0);
  await choose("Признак пожара (транспорт): Открытое пламя / Дым");
  await choose("Транспорт (пламя, дым): Автомашина");
  await editor
    .getByLabel("Описание", { exact: true })
    .fill("Огонь под капотом автомобиля");
  await editor.screenshot({
    path: info.outputPath("101-transport.png"),
    animations: "disabled",
  });
  await editor
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  await expect(
    editor.getByRole("button", { name: "Сохранить черновик", exact: true }),
  ).toBeEnabled();
  const work = await call("GET", `student/lessons/${lesson.id}`, student.token);
  const attemptPath = `student/attempts/${work.assignments[0].attempt_id}`;
  const attempt = await call("GET", attemptPath, student.token);
  expect(attempt.card.data.features.ekp).toEqual({
    where: "Транспорт",
    transport_sign: "Открытое пламя / Дым",
    transport_object: "Автомашина",
    description: "Огонь под капотом автомобиля",
  });
  const invalid = await request.put(`/api/v1/${attemptPath}/card`, {
    headers: { Authorization: `Bearer ${student.token}` },
    data: {
      revision: attempt.card.revision,
      classifier_entry_id: entry.id,
      data: {
        ...attempt.card.data,
        features: {
          ekp: { ...attempt.card.data.features.ekp, street_object: "Мусор" },
        },
      },
    },
  });
  expect(invalid.status()).toBe(422);
  await choose("Где: Транспорт");
  await expect(
    editor.getByRole("button", {
      name: "Транспорт (пламя, дым): Автомашина",
      exact: true,
    }),
  ).toHaveCount(0);
  const clone = await call(
    "POST",
    `admin/classifiers/${catalog.id}/versions`,
    admin,
    { label: `Настройка веток ${suffix}` },
  );
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  const adminPage = await context.newPage();
  adminPage.setDefaultTimeout(10000);
  await adminPage.goto("/login");
  await adminPage.getByLabel("Логин", { exact: true }).fill("admin");
  await adminPage.getByLabel("Пароль", { exact: true }).fill(adminPassword);
  await adminPage.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(adminPage).toHaveURL(/admin$/);
  await adminPage.goto("/catalogs");
  await adminPage
    .getByRole("button", { name: clone.label, exact: true })
    .click();
  await adminPage.getByLabel("Поиск правила ЕКП").fill("101");
  await adminPage.getByRole("button", { name: "101", exact: true }).click();
  const rule = adminPage.getByRole("dialog").last();
  await rule
    .getByRole("textbox", { name: /^Ключ признака 1(?:\s|$)/ })
    .fill("location_kind");
  await rule
    .getByText("Когда показывать «Признак пожара (улица)»", { exact: true })
    .scrollIntoViewIfNeeded();
  await rule.screenshot({
    path: info.outputPath("catalog-visibility-editor.png"),
    animations: "disabled",
  });
  await rule
    .getByRole("button", { name: "Сохранить правило", exact: true })
    .click();
  await expect(
    adminPage.getByRole("button", { name: "Сохранить правило", exact: true }),
  ).toHaveCount(0);
  const edited = await call(
    "GET",
    `admin/classifiers/${clone.id}/export`,
    admin,
  );
  const editedFire = edited.entries.find(
    (e: { name: string }) => e.name === "101",
  );
  expect(editedFire.features[1].visible_when).toEqual([
    { location_kind: "Улица" },
  ]);
  await context.close();
  expect(errors).toEqual([]);
});
