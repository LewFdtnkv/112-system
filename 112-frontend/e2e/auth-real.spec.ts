import { test, expect } from "@playwright/test";
// Run only against an isolated freshly migrated database, never against user data.
test("real API: initial password, profile, reload, logout and a student account", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    process.env.AUTH_ISOLATED_API !== "true",
    "Requires the disposable auth test backend",
  );
  await page.goto("/login");
  await page.getByLabel("Логин").fill("admin");
  await page.getByLabel("Пароль", { exact: true }).fill("incorrect");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("alert")).toContainText("Проверьте логин");
  await page.getByLabel("Пароль", { exact: true }).fill("admin");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/change-password$/);
  await page.screenshot({
    path: testInfo.outputPath("real-change-password.png"),
    animations: "disabled",
  });
  await page.getByLabel("Текущий пароль", { exact: true }).fill("admin");
  await page
    .getByLabel("Новый пароль", { exact: true })
    .fill("isolated-admin-password-2026");
  await page
    .getByLabel("Повторите новый пароль", { exact: true })
    .fill("isolated-admin-password-2026");
  await page.getByRole("button", { name: "Сохранить пароль" }).click();
  await expect(page).toHaveURL(/admin$/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Кабинет администратора" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Кабинет преподавателя" }),
  ).toHaveCount(0);
  const adminPair = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("dds112-tokens-v1")!),
  );
  const created = await request.post("/api/v1/users", {
    headers: { Authorization: `Bearer ${adminPair.access_token}` },
    data: {
      username: "browser_student",
      initial_password: "isolated-student-start",
      first_name: "Тестовый",
      last_name: "Ученик",
    },
  });
  expect(created.status()).toBe(201);
  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/login$/);
  const revoked = await request.post("/api/v1/auth/refresh", {
    data: { refresh_token: adminPair.refresh_token },
  });
  expect(revoked.status()).toBe(401);
  await page.getByLabel("Логин").fill("browser_student");
  await page
    .getByLabel("Пароль", { exact: true })
    .fill("isolated-student-start");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/change-password$/);
  await page
    .getByLabel("Текущий пароль", { exact: true })
    .fill("isolated-student-start");
  await page
    .getByLabel("Новый пароль", { exact: true })
    .fill("isolated-student-final");
  await page
    .getByLabel("Повторите новый пароль", { exact: true })
    .fill("isolated-student-final");
  await page.getByRole("button", { name: "Сохранить пароль" }).click();
  await expect(page).toHaveURL(/student$/);
  await expect(page.locator(".app-header__user")).toHaveText("Ученик Тестовый");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Кабинет ученика" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("real-student.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/login$/);
});
