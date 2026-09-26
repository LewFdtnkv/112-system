import { test, expect } from "./auth-fixture";

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

for (const own of [false, true]) {
  test(`admin resets ${own ? "own" : "another user's"} password`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const admin = {
      id: "admin",
      username: "admin",
      first_name: "Администратор",
      last_name: "",
      middle_name: null,
      email: null,
      is_active: true,
      is_admin: true,
      is_teacher: false,
      role: "admin",
      must_change_password: false,
    };
    let user = {
      ...admin,
      id: own ? "admin" : "student",
      username: own ? "admin" : "demo-student",
      first_name: own ? "Администратор" : "Анна",
      last_name: own ? "" : "Смирнова",
      is_admin: own,
      role: own ? "admin" : "student",
      groups: [],
      created_at: "2026-09-26T08:00:00Z",
      updated_at: "2026-09-26T08:00:00Z",
      last_login_at: "2026-09-26T09:00:00Z",
      password_changed_at: "2026-09-26T08:00:00Z",
    };
    let rejected = !own;
    let requests = 0;
    let patches = 0;
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
            { role: "teacher", registered: 0, sessions: 0 },
            { role: "student", registered: own ? 0 : 1, sessions: 0 },
          ],
        });
      if (path === "views/users")
        return route.fulfill({
          json: { items: [user], total: 1, limit: 20, offset: 0 },
        });
      if (path === `users/${user.id}`) {
        if (route.request().method() === "PATCH") patches++;
        return route.fulfill({ json: user });
      }
      if (path === `users/${user.id}/reset-password`) {
        requests++;
        expect(route.request().postDataJSON()).toEqual({
          temporary_password: "student-temporary-123",
        });
        if (rejected)
          return route.fulfill({
            status: 422,
            json: {
              detail: [
                {
                  loc: ["body", "temporary_password"],
                  type: "value_error",
                  msg: "Проверьте временный пароль",
                },
              ],
            },
          });
        user = {
          ...user,
          must_change_password: true,
          updated_at: "2026-09-26T10:00:00Z",
          password_changed_at: "2026-09-26T10:00:00Z",
        };
        return route.fulfill({ json: user });
      }
      return route.fallback();
    });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto("/login");
    await page.getByLabel("Логин").fill("admin");
    await page.getByLabel("Пароль").fill("admin-password");
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page).toHaveURL(/admin$/);
    await page.goto("/users");
    await page
      .getByRole("row")
      .filter({ hasText: user.username })
      .getByRole("cell")
      .first()
      .click();
    await page
      .getByRole("button", { name: "Сбросить пароль", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: `Сброс пароля · ${user.username}`,
    });
    await expect(dialog).toBeVisible();
    const password = dialog.getByLabel(/^Временный пароль/);
    const confirmation = dialog.getByLabel(/^Повторите временный пароль/);
    const submit = dialog.getByRole("button", {
      name: "Сбросить пароль",
      exact: true,
    });
    await password.fill("short");
    await confirmation.fill("short");
    await submit.click();
    await expect(password).toHaveAttribute("aria-invalid", "true");
    expect(requests).toBe(0);
    await password.fill("student-temporary-123");
    await confirmation.fill("different-password");
    await submit.click();
    await expect(confirmation).toHaveAttribute("aria-invalid", "true");
    expect(requests).toBe(0);
    await confirmation.fill("student-temporary-123");
    if (!own) {
      await submit.click();
      await expect(password).toHaveAttribute("aria-invalid", "true");
      await expect(dialog).toContainText("Проверьте выделенные поля");
      rejected = false;
      await password.fill("student-temporary-1234");
      await password.fill("student-temporary-123");
      await expect(dialog).toHaveCSS("opacity", "1");
      await page.screenshot({
        path: `docs/screenshots/password-reset/${browserName}-desktop.png`,
        animations: "disabled",
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: `docs/screenshots/password-reset/${browserName}-mobile.png`,
        animations: "disabled",
      });
    }
    await confirmation.press("Enter");
    if (own) {
      await expect(page).toHaveURL(/login$/);
    } else {
      await expect(dialog).toContainText("Пароль сброшен");
      await expect(dialog.locator("input")).toHaveCount(0);
      await dialog.getByRole("button", { name: "Готово" }).click();
      await expect(page.getByRole("dialog")).toContainText(
        "Обязательная смена пароля: Да",
      );
      await page
        .getByRole("button", { name: "Сбросить пароль", exact: true })
        .click();
      await expect(password).toHaveValue("");
      await dialog.getByRole("button", { name: "Отмена" }).click();
    }
    expect(patches).toBe(0);
    expect(errors).toEqual([]);
  });
}
