import { test, expect } from "./auth-fixture";
test("reopening an operator card reuses the shared query snapshot", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Логин").fill("student1");
  await page.getByLabel("Пароль").fill("test-password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/student$/);
  await page.goto("/student/sessions/lesson");
  let reads = 0;
  page.on("request", (request) => {
    if (
      request.method() === "GET" &&
      /\/student\/attempts\/[^/]+$/.test(request.url())
    )
      reads++;
  });
  await page.getByRole("button", { name: "Продолжить заполнение" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Продолжить заполнение" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(reads).toBe(1);
  await page.screenshot({
    path: testInfo.outputPath("operator.png"),
    animations: "disabled",
  });
});

test("legacy submitted work without a persisted grade shows a fallback", async ({
  page,
}) => {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/login");
  await page.getByLabel("Логин").fill("student1");
  await page.getByLabel("Пароль").fill("test-password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/student$/);
  await page.goto("/student/sessions/lesson");
  await page.getByRole("button", { name: "Продолжить заполнение" }).click();
  await page
    .getByRole("button", { name: "Оповестить и сохранить карточку" })
    .click();
  await expect(
    page.getByText("Карточка передана на учебную проверку."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.goto("/results/lesson");
  await expect(page.getByRole("alert")).toContainText(
    "Автоматическая оценка недоступна",
  );
  await expect(page.getByText(/Итог:/)).toHaveCount(0);
  await page.goto("/analytics");
  await expect(page).toHaveURL(/403$/);
});
