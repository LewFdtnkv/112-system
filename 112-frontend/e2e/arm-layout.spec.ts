import { expect, test } from "./auth-fixture";
for (const viewport of [
  { width: 1920, height: 964 },
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`ARM layout and server draft at ${viewport.width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    page.on("dialog", (dialog) => void dialog.accept());
    await page.goto("/login");
    await page.getByLabel("Логин").fill("student1");
    await page.getByLabel("Пароль", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page).toHaveURL(/student$/);
    await page.goto("/student/sessions/lesson");
    await expect(
      page.getByRole("table", { name: "Список происшествий" }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("journal.png"),
      fullPage: true,
      animations: "disabled",
    });
    await expect(page.locator("body")).toHaveJSProperty(
      "scrollWidth",
      viewport.width,
    );
    await page.getByRole("row", { name: "Карточка 1042", exact: true }).focus();
    await page.keyboard.press("Enter");
    const card = page.getByRole("dialog");
    await expect(card).toBeVisible();
    await expect(page.locator(".MuiDialog-container")).toHaveCSS(
      "opacity",
      "1",
    );
    await card
      .getByLabel("Улица", { exact: true })
      .fill("Другая учебная улица");
    await card.getByRole("button", { name: "Сохранить черновик" }).click();
    await expect(card.getByText("Черновик сохранён на сервере.")).toBeVisible();
    await expect(card.getByLabel("Улица", { exact: true })).toHaveCSS(
      "user-select",
      "text",
    );
    await expect(card.locator(".arm-card-identification")).toHaveCSS(
      "user-select",
      "none",
    );
    await card
      .getByRole("button", { name: "Оповестить и сохранить карточку" })
      .scrollIntoViewIfNeeded();
    await expect(
      card.getByRole("button", { name: "Оповестить и сохранить карточку" }),
    ).toBeInViewport();
    await page.screenshot({
      path: info.outputPath("card.png"),
      fullPage: true,
      animations: "disabled",
    });
    await card.getByRole("button", { name: "Закрыть", exact: true }).click();
    await page.reload();
    await page.getByRole("button", { name: "Продолжить заполнение" }).click();
    await expect(card.getByLabel("Улица", { exact: true })).toHaveValue(
      "Другая учебная улица",
    );
    await card
      .getByRole("button", { name: "Оповестить и сохранить карточку" })
      .click();
    await expect(
      card.getByText("Карточка передана на учебную проверку."),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("view.png"),
      fullPage: true,
      animations: "disabled",
    });
  });
}
