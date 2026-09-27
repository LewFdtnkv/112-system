import { test, expect } from "./auth-fixture";

test.use({
  browserName:
    process.env.SERVICE_BROWSER === "firefox" ? "firefox" : "chromium",
  launchOptions: {
    executablePath:
      process.env.SERVICE_BROWSER_PATH ||
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  },
});

test("service card opens, edits names and scopes DDS profiles", async ({
  page,
}) => {
  let service = {
    id: "fire",
    code: "101",
    short_name: "Служба 101",
    name: "Пожарно-спасательная служба города Москвы",
  };
  const other = {
    id: "medical",
    code: "103",
    short_name: "Служба 103",
    name: "Скорая медицинская помощь",
  };
  const profile = {
    id: "profile-fire",
    service_id: "fire",
    name: "Пожарные — Центральный округ",
    status: "published",
    version: 1,
    revision: 1,
    responsibility: "Центральный округ",
    procedure: "Назначить свободную бригаду",
    territories: [],
    objects: [],
    contacts: [],
    crews: [
      {
        code: "crew-1",
        name: "Пожарная бригада № 1",
        description: "Тушение пожаров",
        contact_code: null,
        is_active: true,
      },
    ],
  };
  const unrelated = {
    ...profile,
    id: "profile-other",
    service_id: "medical",
    name: "Медицинский профиль",
  };
  const filteredRequests: string[] = [];
  let createdProfile: Record<string, unknown> | undefined;
  await page.route("**/api/v1/users/me", (r) =>
    r.fulfill({
      json: {
        id: "admin",
        username: "admin",
        first_name: "Администратор",
        is_admin: true,
        is_teacher: false,
        is_active: true,
        must_change_password: false,
      },
    }),
  );
  await page.route("**/api/v1/views/admin/services**", (r) =>
    r.fulfill({
      json: { items: [service, other], total: 2, offset: 0, limit: 20 },
    }),
  );
  await page.route("**/api/v1/views/admin/classifiers**", (r) =>
    r.fulfill({ json: { items: [], total: 0, offset: 0, limit: 20 } }),
  );
  await page.route("**/api/v1/admin/services/fire", async (r) => {
    service = { ...service, ...r.request().postDataJSON() };
    await r.fulfill({ json: service });
  });
  await page.route("**/api/v1/admin/service-profiles**", async (r) => {
    const url = new URL(r.request().url());
    if (r.request().method() === "POST") {
      createdProfile = r.request().postDataJSON();
      return r.fulfill({
        status: 201,
        json: {
          ...createdProfile,
          id: "new-profile",
          status: "draft",
          version: 1,
          revision: 1,
        },
      });
    }
    if (url.pathname.endsWith("/profile-fire"))
      return r.fulfill({ json: profile });
    const id = url.searchParams.get("service_id");
    if (id) filteredRequests.push(id);
    const items =
      id === "fire" ? [profile] : id === "medical" ? [] : [profile, unrelated];
    return r.fulfill({
      json: { items, total: items.length, offset: 0, limit: 20 },
    });
  });
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill("admin");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/catalogs");
  const table = page.getByRole("table", { name: "Службы", exact: true });
  await table.getByRole("cell", { name: "101", exact: true }).click();
  const card = page.getByRole("dialog", {
    name: "Карточка службы",
    exact: true,
  });
  await expect(card).toContainText(service.name);
  await expect(
    card.getByRole("table", { name: "Профили служб" }),
  ).toContainText(profile.name);
  await expect(card).not.toContainText(unrelated.name);
  expect(filteredRequests).toContain("fire");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `docs/screenshots/service-dialog/${process.env.SERVICE_BROWSER || "chromium"}-desktop.png`,
  });
  await card.getByRole("button", { name: "Редактировать службу" }).click();
  await expect(card.getByLabel("Код службы")).toBeDisabled();
  await card
    .getByLabel("Полное наименование службы")
    .fill("Новое полное наименование службы");
  await card.getByRole("button", { name: "Сохранить службу" }).click();
  await expect(card).toContainText("Новое полное наименование службы");
  await card.getByRole("button", { name: profile.name, exact: true }).click();
  const detail = page.getByRole("dialog", {
    name: "Профиль службы",
    exact: true,
  });
  await expect(detail.getByLabel("Служба профиля")).toBeDisabled();
  await expect(detail.getByLabel("Служба профиля")).toHaveValue(service.name);
  await expect(detail.getByLabel("Название бригады 1")).toHaveValue(
    "Пожарная бригада № 1",
  );
  await detail.getByRole("button", { name: "Закрыть профиль" }).click();
  await expect(card).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `docs/screenshots/service-dialog/${process.env.SERVICE_BROWSER || "chromium"}-mobile.png`,
  });
  await card.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(table).toContainText("Новое полное наименование службы");
  const row = table.getByRole("row").filter({ hasText: "103" });
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(card).toContainText(other.name);
  await expect(card).toContainText("Профилей пока нет.");
  await card.getByRole("button", { name: "Создать профиль службы" }).click();
  const fresh = page.getByRole("dialog", { name: "Новый профиль службы" });
  await expect(fresh.getByLabel("Служба профиля")).toHaveValue(other.name);
  await expect(fresh.getByLabel("Служба профиля")).toBeDisabled();
  await fresh.getByLabel("Название профиля").fill("Новый медицинский профиль");
  await fresh.getByLabel("Зона ответственности").fill("Северный округ");
  await fresh
    .getByRole("button", { name: "Сохранить профиль", exact: true })
    .click();
  await expect(fresh).not.toBeVisible();
  expect(createdProfile?.service_id).toBe("medical");
  await card.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page
    .getByRole("button", { name: "Создать службу", exact: true })
    .click();
  const newService = page.getByRole("dialog", { name: "Новая служба" });
  await newService
    .getByRole("button", { name: "Создать службу", exact: true })
    .click();
  await expect(newService.getByLabel("Код службы")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await newService.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(newService).not.toBeVisible();
});
