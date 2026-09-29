import { test, expect } from "@playwright/test";
import { mockBusiness } from "./business-fixture";
test.beforeEach(async ({ page }) => {
  await mockBusiness(page);
});
const pair = {
  access_token: "test-access",
  refresh_token: "test-refresh",
  token_type: "bearer",
  expires_in: 900,
  must_change_password: false,
};
const profile = {
  id: "api-teacher",
  username: "teacher",
  first_name: "Иван",
  last_name: "Учебный",
  middle_name: null,
  email: null,
  is_active: true,
  is_teacher: true,
  is_admin: false,
  must_change_password: false,
};

test("copy login into password, append suffix and submit with Enter", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/v1/auth/login", async (route) => {
    calls++;
    expect(route.request().postDataJSON()).toEqual({
      username: "teacher",
      password: "teacher-123",
    });
    await route.fulfill({ json: pair });
  });
  await page.route("**/api/v1/users/me", (route) =>
    route.fulfill({ json: profile }),
  );
  await page.goto("/login");
  const username = page.getByLabel("Логин", { exact: true });
  const password = page.getByLabel("Пароль", { exact: true });
  await expect(username).toBeFocused();
  await username.fill("teacher");
  await username.press("ControlOrMeta+A");
  await username.press("ControlOrMeta+C");
  await password.click();
  await password.press("ControlOrMeta+V");
  await expect(password).toHaveValue("teacher");
  await password.press("End");
  await password.pressSequentially("-123");
  await password.press("Enter");
  await expect(page).toHaveURL(/teacher$/);
  expect(calls).toBe(1);
});

test("API login, mandatory password change, reload, block links and logout", async ({
  page,
}, testInfo) => {
  let changed = false;
  let logout = false;
  await page.route("**/api/v1/auth/login", async (route) => {
    const body = route.request().postDataJSON();
    expect(body).toHaveProperty("username", "teacher");
    await route.fulfill(
      body.password === "wrong"
        ? { status: 401, json: { detail: "Invalid credentials" } }
        : { json: { ...pair, must_change_password: true } },
    );
  });
  await page.route("**/api/v1/auth/change-password", async (route) => {
    expect(route.request().headers().authorization).toBe("Bearer test-access");
    expect(route.request().postDataJSON()).toEqual({
      current_password: "initial-password",
      new_password: "new-password-1234",
    });
    changed = true;
    await route.fulfill({ json: { ...pair, access_token: "new-access" } });
  });
  await page.route("**/api/v1/users/me", async (route) => {
    expect(changed).toBe(true);
    expect(route.request().headers().authorization).toBe("Bearer new-access");
    await route.fulfill({ json: profile });
  });
  await page.route("**/api/v1/auth/logout", async (route) => {
    logout = true;
    await route.fulfill({ status: 204 });
  });
  await page.goto("/teacher");
  await page.getByLabel("Логин", { exact: true }).fill("teacher");
  await page.getByLabel("Пароль", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Проверьте логин");
  await page.getByLabel("Пароль", { exact: true }).fill("initial-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/change-password$/);
  await page.screenshot({
    path: testInfo.outputPath("change-password.png"),
    animations: "disabled",
  });
  await page.goto("/teacher");
  await expect(page).toHaveURL(/change-password$/);
  await page
    .getByLabel("Текущий пароль", { exact: true })
    .fill("initial-password");
  await page
    .getByLabel("Новый пароль", { exact: true })
    .fill("new-password-1234");
  await page
    .getByLabel("Повторите новый пароль", { exact: true })
    .fill("mismatch");
  await page.getByRole("button", { name: "Сохранить пароль" }).click();
  await expect(page.getByText("Пароли не совпадают.")).toBeVisible();
  await page
    .getByLabel("Повторите новый пароль", { exact: true })
    .fill("new-password-1234");
  await page.getByRole("button", { name: "Сохранить пароль" }).click();
  await expect(page).toHaveURL(/teacher$/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Кабинет преподавателя" }),
  ).toBeVisible();
  await expect(page.locator(".app-header__user")).toHaveText("Учебный Иван");
  const tile = page
    .getByRole("navigation", { name: "Работа преподавателя" })
    .getByRole("link", { name: "Сценарии", exact: true });
  const box = await tile.boundingBox();
  expect(box).not.toBeNull();
  await tile.click({ position: { x: 3, y: 3 } });
  await expect(page).toHaveURL(/scenarios$/);
  const sidebar = page
    .getByRole("navigation", { name: "Разделы тренажёра" })
    .getByRole("link", { name: "Кабинет преподавателя" });
  const sidebarBox = (await sidebar.boundingBox())!;
  await page.mouse.click(sidebarBox.x + sidebarBox.width - 4, sidebarBox.y + 4);
  await expect(page).toHaveURL(/teacher$/);
  await page.screenshot({
    path: testInfo.outputPath("teacher-links.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(page).toHaveURL(/login$/);
  expect(logout).toBe(true);
  expect(
    await page.evaluate(() => sessionStorage.getItem("dds112-tokens-v1")),
  ).toBeNull();
  await page.screenshot({
    path: testInfo.outputPath("login.png"),
    animations: "disabled",
  });
});

test("refreshes an expired access token on reload and rejects a revoked session", async ({
  page,
}) => {
  let revoked = false;
  let refreshes = 0;
  await page.addInitScript((tokens) => {
    if (!sessionStorage.getItem("dds112-tokens-v1"))
      sessionStorage.setItem(
        "dds112-tokens-v1",
        JSON.stringify({ state: { tokens }, version: 0 }),
      );
  }, pair);
  await page.route("**/api/v1/users/me", (route) =>
    route.fulfill(
      !revoked && route.request().headers().authorization === "Bearer rotated"
        ? { json: profile }
        : { status: 401, json: {} },
    ),
  );
  await page.route("**/api/v1/auth/refresh", async (route) => {
    refreshes++;
    await route.fulfill(
      revoked
        ? { status: 401, json: {} }
        : {
            json: {
              ...pair,
              access_token: "rotated",
              refresh_token: "rotated-refresh",
            },
          },
    );
  });
  await page.goto("/teacher");
  await expect(
    page.getByRole("heading", { name: "Кабинет преподавателя" }),
  ).toBeVisible();
  expect(refreshes).toBe(1);
  revoked = true;
  await page.reload();
  await expect(page).toHaveURL(/login$/);
  expect(refreshes).toBe(2);
});

test("administrator does not inherit teacher rights", async ({ page }) => {
  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({ json: pair }),
  );
  await page.route("**/api/v1/users/me", (route) =>
    route.fulfill({ json: { ...profile, is_admin: true, is_teacher: false } }),
  );
  await page.goto("/login");
  await page.getByLabel("Логин").fill("admin");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/admin$/);
  await expect(
    page.getByRole("link", { name: "Кабинет преподавателя" }),
  ).toHaveCount(0);
  await page.goto("/teacher");
  await expect(page).toHaveURL(/403$/);
});
