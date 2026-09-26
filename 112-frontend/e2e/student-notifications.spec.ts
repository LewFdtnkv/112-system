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

test("student bell counts all unread messages and synchronizes read state", async ({
  page,
}) => {
  await page.route("**/api/v1/student/overview*", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "demo-student-1",
          username: "student1",
          first_name: "Анна",
          last_name: "Смирнова",
          middle_name: null,
          email: null,
        },
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
          tracks: [
            {
              track: "training",
              graded_lessons: 0,
              overall_percent: null,
              recent_percent: null,
              recent_count: 0,
              recent_lessons: [],
            },
          ],
        },
      },
    }),
  );
  const messages = Array.from({ length: 25 }, (_, i) => ({
    id: `message-${i}`,
    text:
      i === 0
        ? "Повторите заполнение адреса. В двух последних занятиях вы пропускали номер дома."
        : `Сообщение ${i}: перед следующим занятием повторите порядок работы с карточкой.`,
    source: i === 0 ? "learning_advice" : "teacher",
    details: i === 0 ? { role: "operator_112", mode: "ai" } : {},
    teacher_name: "Мария Иванова",
    group_name: null,
    created_at: "2026-09-26T09:00:00Z",
    read_at: null as string | null,
  }));
  let summaryError = false;
  await page.route("**/api/v1/student/messages**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/summary"))
      return route.fulfill(
        summaryError
          ? { status: 503, json: { detail: "Недоступно" } }
          : {
              json: { unread_count: messages.filter((m) => !m.read_at).length },
            },
      );
    if (url.pathname.endsWith("/read")) {
      const id = url.pathname.split("/").at(-2);
      messages.find((m) => m.id === id)!.read_at = new Date().toISOString();
      return route.fulfill({ status: 204 });
    }
    const unread = url.searchParams.get("unread_only") === "true";
    const rows = messages.filter((m) => !unread || !m.read_at);
    const offset = Number(url.searchParams.get("offset"));
    return route.fulfill({
      json: {
        items: rows.slice(offset, offset + 20),
        total: rows.length,
        offset,
        limit: 20,
      },
    });
  });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/login");
  await page.getByLabel("Логин").fill("student1");
  await page.getByLabel("Пароль").fill("password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  const bell = page.getByRole("button", {
    name: "Непрочитанные сообщения: 25",
    exact: true,
  });
  await expect(bell).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Кабинет ученика" }),
  ).toBeVisible();
  await expect(bell.locator(".MuiBadge-badge")).toHaveText("25");
  await page.screenshot({
    path: `docs/screenshots/student-notifications/${browserName}-header.png`,
    animations: "disabled",
  });
  await bell.click();
  const popup = page.getByRole("dialog", { name: "Сообщения ученика" });
  await expect(popup).toContainText("Учебный помощник");
  await expect(popup).toContainText("1–20 из 25");
  await page.screenshot({
    path: `docs/screenshots/student-notifications/${browserName}-open.png`,
    animations: "disabled",
  });
  expect(messages.filter((m) => !m.read_at)).toHaveLength(25);
  await popup
    .getByRole("button", { name: "Прочитано", exact: true })
    .first()
    .click();
  await expect(popup).not.toContainText("Повторите заполнение адреса");
  await expect(popup).toContainText("1–20 из 24");
  await popup.getByRole("button", { name: "Следующая страница" }).click();
  await expect(popup).toContainText("21–24 из 24");
  await popup.getByRole("button", { name: "Закрыть сообщения" }).focus();
  await page.keyboard.press("Escape");
  const updated = page.getByRole("button", {
    name: "Непрочитанные сообщения: 24",
    exact: true,
  });
  await expect(updated).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await updated.click();
  await expect(popup).toBeVisible();
  const box = await popup.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: `docs/screenshots/student-notifications/${browserName}-mobile.png`,
    animations: "disabled",
  });
  await popup.getByRole("button", { name: "Закрыть сообщения" }).click();
  messages.forEach((m) => {
    m.read_at = new Date().toISOString();
  });
  await updated.click();
  await expect(popup).toContainText("Непрочитанных сообщений нет");
  await popup.getByRole("button", { name: "Закрыть сообщения" }).click();
  await expect(
    page.getByRole("button", {
      name: "Сообщения. Нет непрочитанных",
      exact: true,
    }),
  ).toBeVisible();
  summaryError = true;
  await page
    .getByRole("button", { name: "Сообщения. Нет непрочитанных", exact: true })
    .click();
  await popup.getByRole("button", { name: "Закрыть сообщения" }).click();
  await expect(
    page.getByRole("button", {
      name: "Сообщения. Не удалось обновить счётчик",
      exact: true,
    }),
  ).toBeVisible({ timeout: 12000 });
  await page.goto("/student/sessions/lesson");
  await expect(page.locator(".arm-workspace")).toBeVisible();
  await expect(page.locator(".app-header")).toHaveCount(0);
  await expect(page.locator(".student-notifications__bell")).toHaveCount(0);
});

test("teacher header has no student bell", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Логин").fill("teacher");
  await page.getByLabel("Пароль").fill("password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/teacher$/);
  await expect(page.locator(".app-header")).toBeVisible();
  await expect(page.locator(".student-notifications__bell")).toHaveCount(0);
});
