import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";
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

test("integer incident numbers survive filtering, sorting and reopening", async ({
  page,
}) => {
  const fixture = await mockBusiness(page);
  const attempt = fixture.currentAttempt();
  const uuid = "ac723ed2-3324-4d27-954e-d6e9e5c2b101";
  attempt.card.id = uuid;
  await page.route("**/api/v1/student/lessons/lesson", (route) =>
    route.fulfill({
      json: {
        id: "lesson",
        title: "Учебное занятие",
        status: "active",
        work_status: "in_progress",
        started_at: attempt.started_at,
        ended_at: null,
        learning: attempt.learning,
        assignments: [1042, 1047].map((number, index) => ({
          id: index ? "assignment-second" : attempt.assignment_id,
          position: index + 1,
          title: "Сообщение о происшествии",
          role: "operator_112",
          available: true,
          attempt_id: index ? "attempt-second" : attempt.id,
          status: "in_progress",
          card: {
            id: index ? "9a33120c-7898-4b1d-935b-22dbe7991002" : uuid,
            display_number: number,
            started_at: index ? "2026-09-26T09:00:00Z" : "2026-09-26T08:00:00Z",
            status: "draft",
            address_text: "Учебная улица, 7",
            description: "Дым из окна",
            caller_name: "Иван Петров",
            caller_phone: null,
            classifier_entry_id: "entry",
            category_name: "Пожар",
          },
        })),
      },
    }),
  );
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/login");
  await page.getByLabel("Логин").fill("student1");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/student$/);
  await page.goto("/student/sessions/lesson");
  const table = page.getByRole("table", { name: "Список происшествий" });
  const row = page.getByRole("row", { name: "Карточка 1042", exact: true });
  await expect(row.getByRole("cell").nth(7)).toHaveText("1042");
  await expect(
    page
      .getByRole("row", { name: "Карточка 1047", exact: true })
      .getByRole("cell")
      .nth(7),
  ).toHaveText("1047");
  await expect(table).not.toContainText(uuid);
  await page.getByRole("button", { name: "Дата", exact: true }).click();
  const search = page.getByRole("textbox", {
    name: "Поиск происшествий",
    exact: true,
  });
  await search.fill("1042");
  await search.press("Enter");
  await expect(row).toBeVisible();
  await expect(
    page.getByRole("row", { name: "Карточка 1047", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "сбросить", exact: true }).click();
  await page.screenshot({
    path: `docs/screenshots/incident-numbers/${browserName}-journal.png`,
    animations: "disabled",
  });
  await row.click();
  const card = page.getByRole("dialog");
  await expect(card.locator(".arm-card-identification")).toContainText(
    "Происшествие 1042",
  );
  await expect(card.locator(".arm-card-identification")).not.toContainText(
    uuid,
  );
  await expect(page.locator(".MuiDialog-container")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: `docs/screenshots/incident-numbers/${browserName}-card.png`,
    animations: "disabled",
  });
  await card.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.reload();
  await expect(row.getByRole("cell").nth(7)).toHaveText("1042");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `docs/screenshots/incident-numbers/${browserName}-mobile.png`,
    animations: "disabled",
  });
});
