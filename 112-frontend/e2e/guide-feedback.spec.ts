import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";
import { defaultLearningPolicy } from "../src/entities/training/model/learning";

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

test("guide waits for idle input and reveals only incorrect answers", async ({
  page,
}) => {
  const fixture = await mockBusiness(page, {
    ...defaultLearningPolicy(),
    kind: "introduction",
    assistance: { max_level: "solution", on_request: true },
  });
  fixture.currentAttempt().caller_message = "На Лесной улице, 12, дым из окна.";
  fixture.currentAttempt().card.data.address_text = "";
  fixture.currentAttempt().card.data.address_details.street = "";
  fixture.currentAttempt().card.data.address_details.house = "";
  let introduced = false;
  const checks: number[] = [];
  await page.route("**/api/v1/student/attempts/attempt/hints", (route) => {
    const command = route.request().postDataJSON();
    if (command.confirm_hint_id) introduced = true;
    const attempt = fixture.currentAttempt();
    const address = attempt.card.data.address_details;
    const task = !introduced
      ? "guide.source"
      : address.street === "Лесная улица" && address.house === "12"
        ? "description"
        : "guide.address";
    if (command.check_task) checks.push(Date.now());
    const wrong =
      task === "guide.address" &&
      command.check_task === task &&
      address.street &&
      address.street !== "Лесная улица";
    return route.fulfill({
      json: {
        status: "ready",
        revision: attempt.card.revision,
        hint: {
          id: `hint-${task}-${attempt.card.revision}-${!!command.check_task}`,
          task,
          target:
            task === "guide.source"
              ? "source"
              : task === "guide.address"
                ? "address"
                : "description",
          text:
            task === "guide.source"
              ? "Прочитайте условие и нажмите «Продолжить»."
              : task === "guide.address"
                ? "Заполните адрес по условию задачи: улицу и дом."
                : "Опишите происшествие своими словами.",
          level: "solution",
          presentation: "highlight",
          advance: task === "guide.address" ? "action" : "confirm",
          continue_allowed: true,
          correction: wrong
            ? "Попробуйте исправить ответ. По условию задачи: Улица — Лесная улица."
            : null,
        },
      },
    });
  });
  await page.route("**/api/v1/telephony/attempts/attempt", (r) =>
    r.fulfill({
      json: { enabled: false, station: null, active_call: null, calls: [] },
    }),
  );
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/login");
  await page.getByLabel("Логин").fill("student1");
  await page.getByLabel("Пароль").fill("password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/student$/);
  await page.goto("/student/sessions/lesson");
  await page
    .getByRole("button", { name: "Продолжить заполнение", exact: true })
    .click();
  await expect(page.locator(".arm-card-dialog .MuiDialog-container")).toHaveCSS(
    "opacity",
    "1",
  );
  const guide = page.getByRole("region", { name: "Текущий шаг обучения" });
  await guide.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(guide).toContainText("Заполните адрес");
  await expect(guide).not.toContainText("Лесная улица");
  await page.screenshot({
    path: `docs/screenshots/guide-feedback/${browserName}-initial.png`,
    animations: "disabled",
  });
  const street = page.getByLabel("Улица", { exact: true });
  await street.fill("Ле");
  await page.waitForTimeout(1100);
  await street.fill("Лесн");
  const lastInput = Date.now();
  await page.waitForTimeout(1100);
  await expect(guide).not.toContainText("Попробуйте исправить");
  expect(checks).toHaveLength(0);
  await expect(guide).toContainText("Улица — Лесная улица");
  expect(checks[0] - lastInput).toBeGreaterThanOrEqual(1800);
  await page.screenshot({
    path: `docs/screenshots/guide-feedback/${browserName}-incorrect.png`,
    animations: "disabled",
  });
  await street.fill("Лесная улица");
  await expect(guide).not.toContainText("Попробуйте исправить");
  await expect
    .poll(() => fixture.currentAttempt().card.data.address_details.street)
    .toBe("Лесная улица");
  await expect(
    guide.getByRole("button", { name: "Проверить шаг", exact: true }),
  ).toBeEnabled();
  await expect(guide).not.toContainText("Лесная улица");
  await expect(guide).toContainText("Заполните адрес");
  await page.getByLabel("Дом/Вл", { exact: true }).fill("12");
  await expect(guide).toContainText("Опишите происшествие");
  await expect(
    guide.getByRole("button", { name: "Продолжить", exact: true }),
  ).toBeEnabled();
});
