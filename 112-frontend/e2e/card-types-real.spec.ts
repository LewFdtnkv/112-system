import { expect, test } from "@playwright/test";
import { mockMap } from "./map-fixture";

test("112 popular types, two-character search and registration without notification", async ({
  page,
  request,
}, info) => {
  test.skip(
    process.env.AUTH_ISOLATED_API !== "true",
    "Disposable database required",
  );
  test.setTimeout(90000);
  await mockMap(page);
  await page.route("**/api/v1/addresses/reverse", (route) =>
    route.fulfill({ json: { items: [] } }),
  );
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
  const names = [
    "ДТП",
    "Пожар",
    "Ошибочно набран номер",
    "104",
    "Человек в опасности",
    "Отмена вызова",
    "Тестовый вызов",
    "Передача дежурства",
    "Консультация",
    "Вызов на иностранном языке",
    "Справка-101",
  ];
  const entries = [
    ...names,
    ...Array.from({ length: 25 }, (_, i) => `Дополнительный тип ${i}`),
  ].map((name, i) => ({
    code: `TRAIN.${String(i).padStart(2, "0")}`,
    name,
    display_name: name,
    section: "Учебные типы",
    is_popular: i < 11,
    popular_order: i,
    notification_required: i === 0 || i === 1 || i === 3 || i === 4,
    features:
      i === 2
        ? [
            {
              key: "place",
              label: "Место",
              type: "choice",
              options: ["Дом", "Улица"],
            },
            {
              key: "signs",
              label: "Уточнения",
              type: "array",
              options: ["Повторный вызов", "Номер уточнён"],
              required: false,
            },
            {
              key: "witness",
              label: "Очевидец",
              type: "boolean",
              required: false,
            },
          ]
        : [],
    routes:
      i === 0 || i === 1 || i === 3 || i === 4
        ? [{ service_code: `training-${suffix}`, is_main: true, when: {} }]
        : [],
  }));
  const catalog = await call("POST", "admin/classifiers/import", admin, {
    format: "system112-ekp-v1",
    label: `Популярные ${suffix}`,
    services: [
      {
        code: `training-${suffix}`,
        name: "Учебное учреждение аварийного реагирования города Москвы",
        short_name: "Служба 101",
      },
    ],
    entries,
  });
  await call("POST", `admin/classifiers/${catalog.id}/publish`, admin);
  const list = await call(
    "GET",
    `classifiers/${catalog.id}/entries?limit=100`,
    teacher.token,
  );
  const entry = list.find(
    (e: { name: string }) => e.name === "Ошибочно набран номер",
  );
  const card = await call("POST", "cards", teacher.token, {
    title: "Ошибочный вызов",
    caller_message: "Извините, я ошибся номером.",
    classifier_version_id: catalog.id,
    classifier_entry_id: entry.id,
    recipient_service_ids: [],
    data: {
      description: "Ошибочно набран номер",
      features: {
        ekp: { place: "Дом", signs: ["Повторный вызов", "Номер уточнён"] },
      },
    },
  });
  const scenario = await call("POST", "scenarios", teacher.token, {
    title: "Служебное обращение",
    role: "operator_112",
    card_ids: [card.id],
  });
  const group = await call("POST", "groups", teacher.token, {
    name: "Проверка популярных типов",
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
  const shortcuts = editor.locator(".arm-category-choices");
  await expect(shortcuts.getByRole("button")).toHaveCount(11);
  await expect(editor).not.toContainText("TRAIN.");
  expect((await shortcuts.boundingBox())!.height).toBeLessThanOrEqual(170);
  await editor.screenshot({
    animations: "disabled",
    path: info.outputPath("card-types-popular.png"),
  });
  const searches: string[] = [];
  page.on("request", (r) => {
    if (
      r.url().includes("classifier-entries") &&
      !r.url().includes("popular=true")
    )
      searches.push(r.url());
  });
  const input = editor.getByLabel("Тип происшествия", { exact: true });
  await input.fill("О");
  await page.waitForTimeout(450);
  await expect(
    editor
      .locator(".arm-category-results")
      .getByRole("button", { name: "Ошибочно набран номер", exact: true }),
  ).toBeVisible();
  expect(searches).toHaveLength(0);
  await input.fill("Ош");
  const results = editor.locator(".arm-category-results");
  await expect(
    results.getByRole("button", { name: "Ошибочно набран номер", exact: true }),
  ).toBeVisible();
  await editor.screenshot({
    animations: "disabled",
    path: info.outputPath("card-types-search.png"),
  });
  await results
    .getByRole("button", { name: "Ошибочно набран номер", exact: true })
    .click();
  await input.click();
  await expect(editor.locator(".arm-category-results")).toHaveCount(0);
  const count = searches.length;
  await input.fill("Д");
  await page.waitForTimeout(450);
  expect(searches).toHaveLength(count);
  await input.fill("");
  await editor
    .getByLabel("Сообщение со слов заявителя", { exact: true })
    .fill("Ошибочно набран номер");
  await editor.getByRole("button", { name: "Место: Дом", exact: true }).click();
  await editor.getByRole("button", { name: "Место: Дом", exact: true }).click();
  await expect(
    editor.getByRole("button", { name: "Место: Дом", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await editor.getByRole("button", { name: "Место: Дом", exact: true }).click();
  await editor
    .getByRole("button", { name: "Очевидец: Да", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Очевидец: Да", exact: true })
    .click();
  await expect(
    editor.getByRole("button", { name: "Очевидец: Да", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    editor.getByRole("button", { name: "Не указано", exact: true }),
  ).toHaveCount(0);
  await editor
    .getByRole("button", { name: "Уточнения: Номер уточнён", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Уточнения: Повторный вызов", exact: true })
    .click();
  const sign = editor.getByRole("button", {
    name: "Уточнения: Повторный вызов",
    exact: true,
  });
  await sign.click();
  await expect(sign).toHaveAttribute("aria-pressed", "false");
  await expect(
    editor.getByRole("button", {
      name: "Уточнения: Номер уточнён",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await sign.click();
  await expect(editor.getByText(/Заполните обязательный признак/)).toHaveCount(
    0,
  );
  await editor.screenshot({
    animations: "disabled",
    path: info.outputPath("card-typed-features.png"),
  });
  await editor.getByRole("button", { name: "Показать адрес на карте" }).click();
  const mapDialog = page.getByRole("dialog", { name: "Карта происшествия" });
  await expect(
    mapDialog.getByText("Тестовая карта", { exact: true }),
  ).toBeVisible();
  await expect(
    mapDialog.getByRole("button", { name: "Применить адрес" }),
  ).toBeDisabled();
  await mapDialog.getByText("Тестовая карта", { exact: true }).click();
  await mapDialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(editor.getByTitle("Координаты происшествия")).toHaveCount(0);
  await editor.getByRole("button", { name: "Показать адрес на карте" }).click();
  await mapDialog.getByText("Тестовая карта", { exact: true }).click();
  await mapDialog.screenshot({
    animations: "disabled",
    path: info.outputPath("card-map-selection.png"),
  });
  await mapDialog.getByRole("button", { name: "Применить адрес" }).click();
  await expect(
    editor.getByText("Оповещение не требуется", { exact: true }),
  ).toBeVisible();
  await editor
    .getByRole("button", { name: "Добавить службы", exact: true })
    .click();
  const services = page.getByRole("dialog", { name: "Добавьте службы" });
  await services
    .getByLabel("Поиск службы", { exact: true })
    .fill(`training-${suffix}`);
  const service = services.getByRole("button", {
    name: "Служба 101 — Учебное учреждение аварийного реагирования города Москвы",
    exact: true,
  });
  await expect(service).toHaveCount(1);
  await service.click();
  await expect(service).toHaveAttribute("aria-pressed", "true");
  await services.screenshot({
    animations: "disabled",
    path: info.outputPath("card-types-services.png"),
  });
  await services
    .getByRole("button", { name: "Сохранить и закрыть", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  await expect(
    editor.getByRole("button", {
      name: "Оповестить и сохранить карточку",
      exact: true,
    }),
  ).toBeEnabled();
  await editor
    .getByRole("button", { name: "Добавить службы", exact: true })
    .click();
  await expect(service).toHaveAttribute("aria-pressed", "true");
  await service.click();
  await expect(service).toHaveAttribute("aria-pressed", "false");
  await services
    .getByRole("button", { name: "Сохранить и закрыть", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Сохранить без оповещения", exact: true })
    .click();
  await expect(
    editor.getByText("Карточка передана на учебную проверку."),
  ).toBeVisible();
  await editor.screenshot({
    animations: "disabled",
    path: info.outputPath("card-types-registered.png"),
  });
  const work = await call("GET", `student/lessons/${lesson.id}`, student.token);
  const attempt = await call(
    "GET",
    `student/attempts/${work.assignments[0].attempt_id}`,
    student.token,
  );
  expect(attempt.card.status).toBe("registered");
  expect(attempt.card.notification_completed_at).toBeNull();
  expect(attempt.notified_services).toEqual([]);
  expect(attempt.card.data.additional_fields.location).toEqual({
    latitude: 55.7558,
    longitude: 37.6173,
  });
  expect(attempt.card.data.features.ekp).toEqual({
    place: "Дом",
    signs: ["Номер уточнён", "Повторный вызов"],
  });
  const grade = await call(
    "GET",
    `student/lessons/${lesson.id}/evaluation`,
    student.token,
  );
  expect(grade.score).toBe("100.00");
  expect(errors).toEqual([]);
});
