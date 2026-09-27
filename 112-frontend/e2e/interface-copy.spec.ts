import { test, expect } from "./auth-fixture";

const serviceId = "5d710477-7641-448b-9496-c7e7f4862af6";
const userId = "6322f1b0-f34e-40eb-b72e-a0aa3edb1262";
const admin = {
  id: "admin",
  username: "admin",
  first_name: "Администратор",
  last_name: "",
  is_admin: true,
  is_teacher: false,
  is_active: true,
  must_change_password: false,
};
const user = {
  ...admin,
  id: userId,
  username: "student-ivanov",
  first_name: "Иван",
  last_name: "Иванов",
  is_admin: false,
  role: "student",
  groups: [],
  created_at: "2026-09-21T10:00:00Z",
  updated_at: "2026-09-21T10:00:00Z",
  last_login_at: null,
  password_changed_at: null,
};
const service = {
  id: serviceId,
  code: "101",
  short_name: "Служба 101",
  name: "Пожарно-спасательная служба Москвы",
};
const list = (items: unknown[]) => ({
  items,
  total: items.length,
  limit: 20,
  offset: 0,
});

test("catalog and account show useful labels; file import and service editing still work", async ({
  page,
}) => {
  let imported = false;
  let renamed = false;
  await page.route("**/api/v1/**", async (r) => {
    const path = new URL(r.request().url()).pathname.replace("/api/v1/", "");
    if (path === "users/me") return r.fulfill({ json: admin });
    if (path === "views/admin/services")
      return r.fulfill({ json: list([service]) });
    if (path === `admin/services/${serviceId}`) {
      expect(r.request().postDataJSON()).toMatchObject({
        name: "Пожарная служба",
      });
      renamed = true;
      return r.fulfill({ json: service });
    }
    if (path === "views/admin/classifiers")
      return r.fulfill({
        json: list([
          { id: "version", label: "ЕКП Москва", status: "published" },
        ]),
      });
    if (path === "admin/service-profiles") return r.fulfill({ json: list([]) });
    if (path === "admin/classifiers/import") {
      expect(r.request().postDataJSON().format).toBe("system112-ekp-v1");
      imported = true;
      return r.fulfill({
        json: { id: "imported", label: "ЕКП", status: "draft" },
      });
    }
    if (path === "admin/statistics") return r.fulfill({ json: [] });
    if (path === "views/users") return r.fulfill({ json: list([user]) });
    if (path === `users/${userId}`) return r.fulfill({ json: user });
    if (path === `admin/users/${userId}/activity`)
      return r.fulfill({
        json: list([
          {
            id: "event",
            actor_id: userId,
            kind: "auth.login",
            occurred_at: "2026-09-27T10:00:00Z",
            reason: null,
          },
        ]),
      });
    return r.fallback();
  });
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill("admin");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/admin$/);
  await page.goto("/catalogs");
  const services = page.getByRole("table", { name: "Службы", exact: true });
  await expect(services).toContainText(service.name);
  await expect(services).not.toContainText(serviceId);
  await expect(page.getByLabel("JSON справочника")).toHaveCount(0);
  await services.getByRole("button").click();
  await page
    .getByRole("textbox", { name: /Полное наименование службы/ })
    .fill("Пожарная служба");
  await page.getByRole("button", { name: "Сохранить службу" }).click();
  await expect.poll(() => renamed).toBe(true);
  await page
    .getByLabel("Загрузить ЕКП JSON", { exact: true })
    .setInputFiles("public/examples/classifier.json");
  await expect(
    page.getByText("Черновик ЕКП загружен", { exact: true }),
  ).toBeVisible();
  expect(imported).toBe(true);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({
      path: `docs/screenshots/interface-copy/catalog-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.goto("/users");
  await page
    .getByRole("row")
    .filter({ hasText: user.username })
    .getByRole("cell")
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Логин", { exact: true })).toHaveValue(
    user.username,
  );
  await expect(dialog).not.toContainText(userId);
  await expect(dialog).toContainText("Последний вход");
  await dialog.getByRole("button", { name: "История действий" }).click();
  const history = page.getByRole("dialog").last();
  await expect(history).toContainText("Вход в систему");
  await expect(history).not.toContainText("auth.login");
  await expect(history).not.toContainText(userId);
});
