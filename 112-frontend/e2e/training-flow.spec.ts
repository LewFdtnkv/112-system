import { test, expect } from "./auth-fixture";
test("submitted work waits for a teacher and has no automatic score", async ({
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
    "Ожидает проверки преподавателем",
  );
  await expect(page.getByText(/Итог:/)).toHaveCount(0);
  await page.goto("/analytics");
  await expect(page).toHaveURL(/403$/);
});
