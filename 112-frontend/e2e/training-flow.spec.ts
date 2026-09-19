import { expect, test } from "@playwright/test";

test("student completes a training session and receives an automatic result", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Электронная почта").fill("student1@example.test");
  await page.getByLabel("Пароль").fill("demo112");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/student$/);

  await page.goto("/student/sessions/demo-session-1");
  await page.getByRole("button", { name: "Принять" }).click();
  await page
    .getByRole("button", { name: "Открыть карточку 378879302" })
    .click();

  const card = page.getByRole("dialog");
  await card
    .getByRole("button", { name: "Учебный комментарий и журнал" })
    .click();
  await card
    .getByRole("textbox", { name: "Действие оператора" })
    .fill("Вызов принят, данные уточнены.");
  await card.getByRole("button", { name: "Зафиксировать действие" }).click();
  await card
    .getByRole("button", { name: "Закрыть учебный комментарий" })
    .click();
  await card.getByRole("button", { name: "Добавить службы" }).click();
  await page.getByRole("button", { name: "103" }).click();
  await page.getByRole("button", { name: "Сохранить и закрыть" }).click();
  await card
    .getByRole("button", { name: "Оповестить и сохранить карточку" })
    .click();
  await card.getByRole("button", { name: "Закрыть" }).click();
  await expect(card).toBeHidden();

  await page.getByRole("button", { name: "Завершить занятие" }).click();
  await expect(page).toHaveURL(/\/results\/demo-session-1$/);
  await expect(page.getByText(/Итог: \d+ \/ 100/)).toBeVisible();
});

test("a student cannot open teacher and administrator routes", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Электронная почта").fill("student1@example.test");
  await page.getByLabel("Пароль").fill("demo112");
  await page.getByRole("button", { name: "Войти" }).click();

  await page.goto("/analytics");
  await expect(page).toHaveURL(/\/403$/);
  await expect(page.getByText("Доступ запрещён")).toBeVisible();
});
