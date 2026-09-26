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

test("shared photos, missing and broken images, upload refresh and mobile header", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  const admin = {
    id: "admin",
    username: "admin",
    first_name: "Анна",
    last_name: "Смирнова",
    middle_name: null,
    email: null,
    is_active: true,
    is_teacher: false,
    is_admin: true,
    role: "admin",
    must_change_password: false,
    groups: [],
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    last_login_at: null,
    password_changed_at: "2026-09-25T10:00:00Z",
  };
  const users = [
    admin,
    ...[
      ["empty", "Иван", "Петров"],
      ["unavailable", "Мария", "Соколова"],
      ["broken", "Павел", "Волков"],
    ].map(([id, first_name, last_name]) => ({
      ...admin,
      id,
      username: id,
      first_name,
      last_name,
      is_admin: false,
      role: "student",
    })),
  ];
  const requests: Record<string, number> = {};
  let uploaded = false;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/api/v1/",
      "",
    );
    if (path === "users/me") return route.fulfill({ json: admin });
    if (path === "admin/statistics")
      return route.fulfill({
        json: [
          { role: "admin", registered: 1, enabled: 1, sessions: 1 },
          { role: "student", registered: 3, enabled: 3, sessions: 0 },
        ],
      });
    if (path === "views/users")
      return route.fulfill({
        json: { items: users, total: users.length, limit: 20, offset: 0 },
      });
    const photo = path.match(/^(?:admin\/)?users\/(.+)\/photo$/);
    if (photo) {
      const id = photo[1];
      if (route.request().method() === "PUT") {
        uploaded = true;
        return route.fulfill({ status: 204 });
      }
      requests[id] = (requests[id] ?? 0) + 1;
      if (id === "empty") return route.fulfill({ status: 204 });
      if (id === "unavailable")
        return route.fulfill({
          status: 404,
          json: { detail: "Фото недоступно" },
        });
      if (id === "broken")
        return route.fulfill({
          contentType: "image/png",
          body: "invalid-image",
        });
      // A code-drawn fixture portrait; production photos are normalized by the API.
      return route.fulfill({
        contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="${uploaded ? "#d9e8ca" : "#c9e0ef"}"/><circle cx="40" cy="29" r="15" fill="#77523e"/><ellipse cx="40" cy="75" rx="29" ry="26" fill="#3c617b"/></svg>`,
      });
    }
    const user = users.find((item) => path === `users/${item.id}`);
    if (user) return route.fulfill({ json: user });
    return route.fallback();
  });
  await page.goto("/login");
  await page.getByLabel("Логин").fill("admin");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/admin$/);
  // Client navigation keeps the shared query cache alive.
  await page
    .getByRole("region", { name: "Управление" })
    .getByRole("link", { name: "Пользователи", exact: true })
    .click();
  const table = page.getByRole("table", { name: "Пользователи" });
  const adminRow = table.getByRole("row").filter({ hasText: "(admin)" });
  await expect(adminRow.locator("img")).toBeVisible();
  await expect(page.locator(".app-header__user img")).toBeVisible();
  for (const id of ["empty", "unavailable", "broken"]) {
    const row = table.getByRole("row").filter({ hasText: `(${id})` });
    await expect(row.getByTestId("PersonIcon")).toBeVisible();
    await expect(row.locator("img")).toHaveCount(0);
  }
  await adminRow.getByRole("button").click();
  const dialog = page.getByRole("dialog");
  const profile = dialog.getByRole("img", { name: "Фотография пользователя" });
  await expect(profile).toBeVisible();
  expect(requests.admin).toBe(1);
  const oldSource = await profile.getAttribute("src");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(profile).not.toHaveAttribute("src", oldSource!);
  const source = await profile.getAttribute("src");
  await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(adminRow.locator("img")).toHaveAttribute("src", source!);
  await expect(page.locator(".app-header__user img")).toHaveAttribute(
    "src",
    source!,
  );
  expect(requests.admin).toBe(2);
  await page.screenshot({
    path: info.outputPath("users-desktop.png"),
    animations: "disabled",
  });
  await table
    .getByRole("row")
    .filter({ hasText: "(empty)" })
    .getByRole("button")
    .click();
  await expect(dialog.getByTestId("PersonIcon")).toBeVisible();
  await expect(dialog.locator("img")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".app-header__user img")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.body.scrollWidth))
    .toBe(390);
  await page.screenshot({
    path: info.outputPath("users-mobile.png"),
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});

test("teacher lesson list and student summary keep names clickable beside icons", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.route("**/api/v1/teaching/monitoring*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            attempt_id: "attempt",
            student_id: "demo-student-1",
            student_name: "Анна Смирнова",
            title: "Учебное занятие",
            visibility: "tab.visible",
            focus: "window.focus",
            hidden_count: 0,
            last_seen: null,
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.route(
    "**/api/v1/teaching/students/demo-student-1/overview*",
    (route) =>
      route.fulfill({
        json: {
          user: {
            id: "demo-student-1",
            first_name: "Анна",
            last_name: "Смирнова",
            middle_name: null,
          },
          groups: ["Группа 1"],
          active_lessons: { items: [], total: 1 },
          performance: {
            completed_lessons: 4,
            tracks: [
              { track: "training", overall_percent: 80, recent_percent: 90 },
            ],
          },
        },
      }),
  );
  await page.goto("/login");
  await page.getByLabel("Логин").fill("teacher");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/teacher$/);
  await page.goto("/sessions");
  const student = page.getByRole("button", {
    name: "Анна Смирнова",
    exact: true,
  });
  await expect(student.getByTestId("PersonIcon")).toBeVisible();
  await page.screenshot({
    path: info.outputPath("teacher-lessons.png"),
    animations: "disabled",
  });
  await student.click();
  const dialog = page.getByRole("dialog", { name: "Профиль ученика" });
  await expect(dialog.getByTestId("PersonIcon")).toBeVisible();
  await expect(dialog).toContainText("Смирнова Анна");
  await expect(dialog.getByRole("link", { name: "Подробнее" })).toHaveAttribute(
    "target",
    "_blank",
  );
  await expect(page.locator(".MuiDialog-container")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: info.outputPath("teacher-student-summary.png"),
    animations: "disabled",
  });
});
