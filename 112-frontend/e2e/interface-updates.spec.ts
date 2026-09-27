import { test, expect } from "./auth-fixture";
import { mockMap } from "./map-fixture";
import options from "./fixtures/generation-options.json" with { type: "json" };
const browserName = process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH
  ? "firefox"
  : "chromium";
test.use({
  browserName,
  launchOptions: {
    executablePath:
      browserName === "firefox"
        ? process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH
        : process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  },
});

for (const role of ["student", "teacher", "admin"]) {
  test(`${role} edits own name and photo; password visibility does not submit`, async ({
    page,
  }, info) => {
    let user = {
      id: "me",
      username: role,
      first_name: "Анна",
      last_name: "Смирнова",
      middle_name: null,
      email: null,
      is_active: true,
      is_admin: role === "admin",
      is_teacher: role === "teacher",
      role,
      must_change_password: false,
    };
    let uploaded = false;
    let updates = 0;
    await page.route("**/api/v1/users/me", (route) => {
      if (route.request().method() === "PATCH") {
        const payload = route.request().postDataJSON();
        expect(Object.keys(payload).sort()).toEqual([
          "first_name",
          "last_name",
          "middle_name",
        ]);
        user = { ...user, ...payload };
        updates++;
      }
      return route.fulfill({ json: user });
    });
    await page.route("**/api/v1/users/me/photo", (route) => {
      if (route.request().method() === "PUT") {
        uploaded = true;
        return route.fulfill({ status: 204 });
      }
      return uploaded
        ? route.fulfill({
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#dbe7ee"/><circle cx="40" cy="28" r="15" fill="#79553d"/><ellipse cx="40" cy="77" rx="30" ry="28" fill="#287294"/></svg>',
          })
        : route.fulfill({ status: 204 });
    });
    await page.route("**/api/v1/student/overview*", (route) =>
      route.fulfill({
        json: {
          user,
          groups: ["Учебная группа"],
          active_lessons: { items: [], total: 0, offset: 0, limit: 6 },
          performance: {
            total_lessons: 0,
            completed_lessons: 0,
            graded_lessons: 0,
            overall_percent: null,
            recent_percent: null,
            recent_count: 0,
            recent_limit: 5,
            recent_lessons: [],
            tracks: ["training", "assessment"].map((track) => ({
              track,
              graded_lessons: 0,
              overall_percent: null,
              recent_percent: null,
              recent_count: 0,
              recent_lessons: [],
            })),
          },
        },
      }),
    );
    await page.route("**/api/v1/admin/statistics", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.goto("/login");
    await page.getByLabel("Логин", { exact: true }).fill(role);
    const password = page.getByLabel("Пароль", { exact: true });
    await password.fill("test-password");
    await page
      .getByRole("button", { name: "Показать пароль", exact: true })
      .click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(page).toHaveURL(/login$/);
    await expect(password).toHaveValue("test-password");
    await page
      .getByRole("button", { name: "Скрыть пароль", exact: true })
      .click();
    await expect(password).toHaveAttribute("type", "password");
    await page.screenshot({
      path: info.outputPath("login.png"),
      animations: "disabled",
    });
    await password.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${role}$`));
    await page.getByRole("button", { name: "Открыть мой профиль" }).click();
    const dialog = page.getByRole("dialog", { name: "Мой профиль" });
    await expect(dialog.getByLabel("Email")).toHaveCount(0);
    await dialog.getByLabel("Имя", { exact: true }).fill("Мария");
    await dialog.getByLabel("Отчество", { exact: true }).fill("Ивановна");
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMImHAAAALUAaGysefKAAAAAElFTkSuQmCC",
        "base64",
      ),
    });
    await page
      .getByRole("button", { name: "Сохранить фотографию", exact: true })
      .click();
    await expect(
      dialog.getByText("Фотография обновлена", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("img", { name: "Фотография пользователя" }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("profile.png"),
      animations: "disabled",
    });
    await dialog.getByRole("button", { name: "Сохранить изменения" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(".app-header__user")).toContainText(
      "Смирнова Мария Ивановна",
    );
    expect(updates).toBe(1);
    await page.reload();
    await page.getByRole("button", { name: "Открыть мой профиль" }).click();
    await expect(dialog.getByLabel("Имя", { exact: true })).toHaveValue(
      "Мария",
    );
    await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("button", { name: "Открыть мой профиль" }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.body.scrollWidth)).toBe(390);
    await page.getByRole("button", { name: "Открыть мой профиль" }).click();
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Сохранить изменения" }),
    ).toBeVisible();
    await expect(page.locator(".MuiDialog-container")).toHaveCSS(
      "opacity",
      "1",
    );
    await page.screenshot({
      path: info.outputPath("profile-mobile.png"),
      animations: "disabled",
    });
  });
}

test("long scenario title and publication filter remain readable", async ({
  page,
}, info) => {
  const title =
    "Сложное происшествие на перекрёстке улиц с несколькими заявителями, пострадавшими и последовательным оповещением экстренных служб";
  await page.route("**/api/v1/views/scenarios*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "scenario",
            title,
            version: 1,
            category: "Транспорт",
            role: "operator_112",
            difficulty: "advanced",
            card_count: 4,
            status: "published",
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("Логин").fill("teacher");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/teacher$/);
  await page.goto("/scenarios");
  const name = page.getByRole("link").filter({ hasText: title });
  await expect(name).toBeVisible();
  expect(
    await name.evaluate(
      (el) =>
        el.scrollHeight <= el.clientHeight + 1 &&
        el.scrollWidth <= el.clientWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole("combobox", { name: "Публикация" }).click();
  await page.getByRole("option", { name: "Опубликованы", exact: true }).click();
  await page.screenshot({
    path: info.outputPath("scenarios.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.body.scrollWidth)).toBe(390);
  await page.getByLabel("Поиск сценария").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("scenarios-mobile.png"),
    animations: "disabled",
  });
});

test("generation map suggests while typing, applies all address parts and cancels without changes", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await mockMap(page);
  await page.route("**/api/v1/classifiers?*", (route) =>
    route.fulfill({ json: [] }),
  );
  let parameters: Record<string, unknown> = {};
  let creates = 0;
  const address = {
    point: { latitude: 55.757, longitude: 37.611 },
    addressLine: "Москва, Тверская улица, дом 10, корпус 2, строение 1",
    country: "Россия",
    administrativeAreas: [],
    localities: ["Москва"],
    district: "",
    area: "",
    street: "Тверская улица",
    house: "10",
    building: "2",
    structure: "1",
    apartment: "",
  };
  await page.route("**/api/v1/addresses/suggest", (route) =>
    route.fulfill({ json: { items: [address] } }),
  );
  await page.route("**/api/v1/card-generations**", (route) => {
    if (route.request().url().includes("/options"))
      return route.fulfill({ json: options });
    if (route.request().method() === "POST") {
      parameters = route.request().postDataJSON().parameters;
      creates++;
      return route.fulfill({ status: 202, json: [] });
    }
    return route.fulfill({
      json: { items: [], total: 0, limit: 10, offset: 0 },
    });
  });
  await page.goto("/login");
  await page.getByLabel("Логин").fill("teacher");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/teacher$/);
  await page.goto("/cards");
  await page.getByRole("button", { name: "Сгенерировать карточки" }).click();
  const generation = page.getByRole("dialog", {
    name: "Сгенерировать карточки",
  });
  await generation
    .getByRole("button", { name: "Выбрать адрес на карте" })
    .click();
  const map = page.getByRole("dialog", { name: "Адрес происшествия на карте" });
  await map.getByLabel("Найти адрес").fill("Москва, Твер");
  await expect(
    map.getByRole("button", { name: address.addressLine, exact: true }),
  ).toBeVisible();
  expect(creates).toBe(0);
  await page.screenshot({
    path: info.outputPath("map-suggestions.png"),
    animations: "disabled",
  });
  await map
    .getByRole("button", { name: address.addressLine, exact: true })
    .click();
  await map.getByRole("button", { name: "Применить адрес" }).click();
  await expect(map).toHaveCount(0);
  await expect(
    generation.getByRole("combobox", { name: "Населённый пункт", exact: true }),
  ).toHaveValue("Москва");
  await expect(
    generation.getByRole("combobox", { name: "Улица", exact: true }),
  ).toHaveValue(address.street);
  await expect(
    generation.getByRole("combobox", { name: "Дом", exact: true }),
  ).toHaveValue("10");
  await expect(generation.getByLabel("Корпус", { exact: true })).toHaveValue(
    "2",
  );
  await generation
    .getByRole("button", { name: "Выбрать адрес на карте" })
    .click();
  await map.getByLabel("Найти адрес").fill("Другой адрес");
  await map.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(
    generation.getByRole("combobox", { name: "Улица", exact: true }),
  ).toHaveValue(address.street);
  await generation
    .getByLabel("Описательный адрес — ориентиры", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("generation-address.png"),
    animations: "disabled",
  });
  await generation.getByRole("button", { name: "Запустить генерацию" }).click();
  await expect(generation).toHaveCount(0);
  expect(parameters).toMatchObject({
    locality: "Москва",
    street: address.street,
    house: "10",
    building: "2",
    structure: "1",
    location: address.point,
    address_format: "structured",
  });
  expect(creates).toBe(1);
});
