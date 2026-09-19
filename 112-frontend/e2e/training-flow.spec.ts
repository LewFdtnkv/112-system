import { test, expect } from "./auth-fixture";
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
