import { expect, test } from "@playwright/test";

// Screenshots are review artifacts, not unverified pixel baselines.
for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`ARM layout and controls at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto("/login");
    await page.getByLabel("Электронная почта").fill("student1@example.test");
    await page.getByLabel("Пароль").fill("demo112");
    await page.screenshot({
      path: testInfo.outputPath("login.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page).toHaveURL(/\/student$/);
    await page.screenshot({
      path: testInfo.outputPath("student.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.goto("/student/sessions/demo-session-1");
    await page.getByRole("button", { name: "Принять", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Создать новую карточку" }),
    ).toBeEnabled();
    await page.screenshot({
      path: testInfo.outputPath("journal.png"),
      fullPage: true,
      animations: "disabled",
    });
    await expect(page.locator("body")).toHaveJSProperty(
      "scrollWidth",
      viewport.width,
    );
    await page.getByRole("button", { name: /Расширенный поиск/ }).click();
    await page
      .getByLabel("По адресу", { exact: true })
      .fill("несуществующий адрес");
    await page.getByRole("button", { name: "Искать по параметрам" }).click();
    await expect(
      page.getByText("Карточки по заданным параметрам не найдены."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Сбросить" }).click();
    await page.getByRole("button", { name: /Расширенный поиск/ }).click();
    // Keyboard activation must still work after splitting description rows.
    await page
      .getByRole("row", { name: "Карточка 378879302", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    const card = page.getByRole("dialog");
    await expect(card).toBeVisible();
    await expect(page.locator(".MuiDialog-container")).toHaveCSS(
      "opacity",
      "1",
    );
    await expect(
      card.getByRole("button", { name: "Отправить на проверку" }),
    ).toBeInViewport();
    await page.screenshot({
      path: testInfo.outputPath("card.png"),
      fullPage: true,
      animations: "disabled",
    });
    await card.getByLabel("Улица", { exact: true }).fill("Учебная улица");
    await card.getByRole("button", { name: "Закрыть", exact: true }).click();
    await page
      .getByRole("button", { name: "Открыть карточку 378879302" })
      .click();
    await expect(card.getByLabel("Улица", { exact: true })).toHaveValue(
      "Учебная улица",
    );
    await card.getByRole("button", { name: "Закрыть", exact: true }).click();
    await page.getByRole("button", { name: "Создать новую карточку" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator(".MuiDialog-container")).toHaveCSS(
      "opacity",
      "1",
    );
    await page.screenshot({
      path: testInfo.outputPath("create.png"),
      fullPage: true,
      animations: "disabled",
    });
  });
}

test("teacher dashboard shares the ARM theme", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/login");
  await page.getByLabel("Электронная почта").fill("teacher@example.test");
  await page.getByLabel("Пароль").fill("demo112");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/teacher$/);
  await page.screenshot({
    path: testInfo.outputPath("teacher.png"),
    fullPage: true,
    animations: "disabled",
  });
});
