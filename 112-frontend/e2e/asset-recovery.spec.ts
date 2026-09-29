import { test, expect } from "./auth-fixture";

test.skip(
  !process.env.ASSET_RECOVERY_CHECK,
  "Requires a production build behind nginx",
);
test.use({
  browserName: process.env.ASSET_BROWSER === "firefox" ? "firefox" : "chromium",
  launchOptions: {
    executablePath:
      process.env.ASSET_BROWSER_PATH ||
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  },
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill("student1");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
}

test("missing login destination chunk reloads once and preserves authentication", async ({
  page,
}) => {
  let failed = false;
  let documents = 0;
  let logins = 0;
  page.on("request", (request) => {
    if (request.resourceType() === "document") documents++;
    if (new URL(request.url()).pathname.endsWith("/auth/login")) logins++;
  });
  await page.route("**/assets/student-dashboard-*.js", (r) => {
    if (!failed) {
      failed = true;
      return r.fulfill({ status: 404, body: "Not found" });
    }
    return r.continue();
  });
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Кабинет ученика", exact: true }),
  ).toBeVisible();
  expect(failed).toBe(true);
  expect(documents).toBe(2);
  expect(logins).toBe(1);
});

test("persistent asset failure stops retrying and offers a real reload", async ({
  page,
}) => {
  let documents = 0;
  page.on("request", (r) => {
    if (r.resourceType() === "document") documents++;
  });
  await page.route("**/assets/student-dashboard-*.js", (r) =>
    r.fulfill({ status: 404, body: "Not found" }),
  );
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Не удалось загрузить страницу" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Обновить страницу" }),
  ).toBeVisible();
  await page.waitForTimeout(500);
  expect(documents).toBe(2);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({
    path: `docs/screenshots/asset-recovery/${process.env.ASSET_BROWSER || "chromium"}.png`,
  });
  await page.unroute("**/assets/student-dashboard-*.js");
  await page.getByRole("button", { name: "Обновить страницу" }).click();
  await expect(
    page.getByRole("heading", { name: "Кабинет ученика", exact: true }),
  ).toBeVisible();
});

test("later navigation failure does not reload automatically", async ({
  page,
}) => {
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Кабинет ученика", exact: true }),
  ).toBeVisible();
  let documents = 0;
  page.on("request", (r) => {
    if (r.resourceType() === "document") documents++;
  });
  await page.route("**/assets/training-result-*.js", (r) =>
    r.fulfill({ status: 404, body: "Not found" }),
  );
  await page.getByRole("link", { name: "Результаты", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Не удалось загрузить страницу" }),
  ).toBeVisible();
  expect(documents).toBe(0);
});

test("nginx separates missing assets from SPA and revalidates HTML", async ({
  request,
}) => {
  const html = await request.get("/login");
  expect(html.status()).toBe(200);
  expect(html.headers()["cache-control"]).toContain("no-cache");
  const missing = await request.get("/assets/removed-version.js");
  expect(missing.status()).toBe(404);
  expect(await missing.text()).not.toContain('<div id="root">');
  expect(missing.headers()["cache-control"] ?? "").not.toContain("immutable");
});
