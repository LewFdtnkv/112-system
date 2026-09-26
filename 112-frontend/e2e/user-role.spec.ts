import { test, expect } from "./auth-fixture";

test("account role is read-only, profile and access remain editable, creation offers roles", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  const admin = {
    id: "admin",
    username: "admin",
    first_name: "Администратор",
    last_name: "",
    middle_name: null,
    email: null,
    is_active: true,
    is_teacher: false,
    is_admin: true,
    role: "admin",
    must_change_password: false,
  };
  let user = {
    ...admin,
    id: "teacher",
    username: "demo-teacher",
    first_name: "Иван",
    last_name: "Петров",
    is_teacher: true,
    is_admin: false,
    role: "teacher",
    groups: [],
    created_at: "2026-09-21T10:00:00Z",
    updated_at: "2026-09-21T10:00:00Z",
    last_login_at: null,
    password_changed_at: "2026-09-21T10:00:00Z",
  };
  const patches: Record<string, unknown>[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/api/v1/",
      "",
    );
    if (path === "users/me") return route.fulfill({ json: admin });
    if (path === "admin/statistics")
      return route.fulfill({
        json: [
          { role: "admin", registered: 1, sessions: 1 },
          { role: "teacher", registered: 1, sessions: 0 },
          { role: "student", registered: 0, sessions: 0 },
        ],
      });
    if (path === "views/users")
      return route.fulfill({
        json: { items: [user], total: 1, limit: 20, offset: 0 },
      });
    if (path === "users/teacher") {
      if (route.request().method() === "PATCH") {
        const payload = route.request().postDataJSON();
        patches.push(payload);
        expect(payload).not.toHaveProperty("role");
        expect(payload).not.toHaveProperty("is_teacher");
        expect(payload).not.toHaveProperty("is_admin");
        user = { ...user, ...payload };
      }
      return route.fulfill({ json: user });
    }
    return route.fallback();
  });
  await page.goto("/login");
  await page.getByLabel("Логин").fill("admin");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/admin$/);
  await page.goto("/users");
  const row = page.getByRole("row").filter({ hasText: "demo-teacher" });
  await row.getByRole("cell").first().click();
  const dialog = page.getByRole("dialog");
  const role = dialog.getByLabel("Роль пользователя");
  await expect(role).toHaveValue("Преподаватель");
  await expect(role).toHaveAttribute("readonly", "");
  await expect(
    dialog.getByRole("combobox", { name: "Роль пользователя" }),
  ).toHaveCount(0);
  await expect(
    dialog.getByText(/Для другой роли создайте нового пользователя/),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("user-role-readonly.png"),
    animations: "disabled",
  });
  await dialog.getByLabel("Имя", { exact: true }).fill("Пётр");
  await dialog.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(dialog).toHaveCount(0);
  expect(patches[0]).toMatchObject({ first_name: "Пётр", is_active: true });
  await row.getByRole("cell").first().click();
  await dialog.getByRole("switch", { name: "Аккаунт активен" }).click();
  await dialog.getByRole("button", { name: "Сохранить изменения" }).click();
  const confirmation = page
    .getByRole("dialog")
    .filter({ hasText: "Подтвердите изменение доступа" })
    .last();
  await confirmation
    .getByLabel("Причина изменения доступа")
    .fill("Учётная запись больше не используется");
  await confirmation
    .getByRole("button", { name: "Подтвердить", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(patches[1]).toMatchObject({
    is_active: false,
    reason: "Учётная запись больше не используется",
  });
  await page.getByRole("button", { name: "Создать пользователя" }).click();
  const createRole = page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Роль пользователя" });
  await createRole.click();
  for (const name of ["Ученик", "Преподаватель", "Администратор"]) {
    await expect(page.getByRole("option", { name, exact: true })).toBeVisible();
  }
});
