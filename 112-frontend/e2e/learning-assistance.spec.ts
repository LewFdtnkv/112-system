import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";
import { defaultLearningPolicy } from "../src/entities/training/model/learning";

test("scenario assistance respects depth, scopes and invalidates on editing", async ({
  page,
}, info) => {
  const policy = {
    ...defaultLearningPolicy(),
    kind: "skill_practice" as const,
    target_skills: ["address" as const],
    assistance: { max_level: "explanation" as const, on_request: true },
  };
  const fixture = await mockBusiness(page, policy, ["address"]);
  await page.route(
    "**/api/v1/student/attempts/attempt/hints",
    async (route) => {
      const request = route.request().postDataJSON();
      await route.fulfill({
        json: {
          status: "ready",
          revision: fixture.currentAttempt().card.revision,
          hint: {
            id: request.request_id,
            task: "address",
            level: request.level,
            text:
              request.level === "goal"
                ? "Уточните место происшествия."
                : "Проверьте поле «Улица» по сообщению заявителя.",
            target: request.level === "goal" ? null : "address",
            presentation: request.level === "goal" ? "text" : "highlight",
          },
        },
      });
    },
  );
  await page.goto("/login");
  await page.getByLabel("Логин").fill("student1");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/student$/);
  await page.goto("/student/sessions/lesson");
  await page
    .getByRole("button", { name: "Продолжить заполнение", exact: true })
    .click();
  await expect(page.getByLabel("Заявитель", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Улица", { exact: true })).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Добавить службы", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Напомнить цель", exact: true })
    .click();
  await expect(page.locator(".learning-help__message")).toContainText(
    "место происшествия",
  );
  await expect(page.locator(".arm-card-dialog")).not.toHaveAttribute(
    "data-learning-highlight",
    "address",
  );
  await page
    .getByRole("button", { name: "Объяснить действие", exact: true })
    .click();
  await expect(page.locator(".arm-card-dialog")).toHaveAttribute(
    "data-learning-highlight",
    "address",
  );
  await expect(
    page.getByRole("button", { name: "Показать эталонное решение" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("contextual-hint.png"),
    animations: "disabled",
  });
  await page.getByLabel("Улица", { exact: true }).fill("Новый адрес");
  await expect(page.locator(".learning-help__message")).toHaveCount(0);
  await expect(page.locator(".arm-card-dialog")).not.toHaveAttribute(
    "data-learning-highlight",
    "address",
  );
  await page
    .getByRole("button", { name: "Напомнить цель", exact: true })
    .click();
  await expect(page.locator(".learning-help__message")).toBeVisible();
  await page.getByRole("button", { name: "Скрыть подсказку" }).click();
  await expect(page.locator(".learning-help__message")).toHaveCount(0);
});

test("assessment never requests or exposes assistance", async ({ page }) => {
  await mockBusiness(page, { ...defaultLearningPolicy(), kind: "assessment" });
  let requests = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/hints")) requests++;
  });
  await page.goto("/login");
  await page.getByLabel("Логин").fill("student1");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/student$/);
  await page.goto("/student/sessions/lesson");
  await page
    .getByRole("button", { name: "Продолжить заполнение", exact: true })
    .click();
  await expect(page.getByLabel("Заявитель", { exact: true })).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Напомнить цель" }),
  ).toHaveCount(0);
  expect(requests).toBe(0);
});
