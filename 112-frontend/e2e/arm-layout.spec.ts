import { expect, test } from "@playwright/test";

// Screenshots are review artifacts, not unverified pixel baselines.
for (const viewport of [
  { width: 1920, height: 964 },
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
    await page
      .getByRole("button", { name: /расширенный по параметрам/ })
      .click();
    await page
      .getByLabel("По адресу", { exact: true })
      .fill("несуществующий адрес");
    await page.getByRole("button", { name: "Искать по параметрам" }).click();
    await expect(
      page.getByText("Карточки по заданным параметрам не найдены."),
    ).toBeVisible();
    await page.getByRole("button", { name: "сбросить" }).click();
    await page
      .getByRole("button", { name: /расширенный по параметрам/ })
      .click();
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
      card.getByRole("button", { name: "Оповестить и сохранить карточку" }),
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
    await page
      .getByRole("button", { name: "Открыть карточку 378879304" })
      .click();
    await expect(page.locator(".MuiDialog-container")).toHaveCSS(
      "opacity",
      "1",
    );
    await card.getByLabel("Тип происшествия", { exact: true }).fill("пожар");
    await card.getByRole("button", { name: "Пожар", exact: true }).click();
    await card.getByRole("button", { name: "Дом", exact: true }).click();
    await card
      .getByRole("button", { name: "Открытое пламя / Дым", exact: true })
      .click();
    await card
      .getByRole("button", { name: "Дом многоквартирный", exact: true })
      .click();
    await page.screenshot({
      path: testInfo.outputPath("fire.png"),
      fullPage: true,
      animations: "disabled",
    });
    await card.getByRole("button", { name: "Добавить службы" }).click();
    await expect(
      page.getByRole("dialog", { name: "Добавьте службы" }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("services.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Сохранить и закрыть" }).click();
    await card
      .getByRole("button", { name: "Учебный комментарий и журнал" })
      .click();
    await card
      .getByRole("button", { name: "Просмотр карточки", exact: true })
      .click();
    await page.screenshot({
      path: testInfo.outputPath("view.png"),
      fullPage: true,
      animations: "disabled",
    });
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

test("ARM fields, clarification answers and selection UX survive reopening", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/login");
  await page.getByLabel("Электронная почта").fill("student1@example.test");
  await page.getByLabel("Пароль").fill("demo112");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/student$/);
  await page.goto("/student/sessions/demo-session-1");
  await page.getByRole("button", { name: "Принять", exact: true }).click();
  await page
    .getByRole("button", { name: "Открыть карточку 378879304" })
    .click();
  const card = page.getByRole("dialog");
  await card.getByLabel("Объект", { exact: true }).fill("Учебное здание");
  await card.getByLabel("Код", { exact: true }).fill("42");
  await card.getByLabel("Предоставленный", { exact: true }).fill("");
  await card.getByRole("button", { name: "АОН", exact: true }).first().click();
  await expect(card.getByLabel("Предоставленный", { exact: true })).toHaveValue(
    "+7 900 000-00-02",
  );
  const question = card
    .locator(".arm-question")
    .filter({ has: page.getByText("Угроза людям", { exact: true }) });
  await question.getByRole("button", { name: "Да", exact: true }).click();
  await card
    .getByRole("button", { name: "Дом многоквартирный", exact: true })
    .click();
  const choice = card.getByRole("button", {
    name: "Дом многоквартирный",
    exact: true,
  });
  await choice.hover();
  await expect(choice).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(choice).toHaveCSS("background-color", "rgb(20, 106, 153)");
  await expect(choice).toHaveCSS("user-select", "none");
  await expect(card.getByLabel("Улица", { exact: true })).toHaveCSS(
    "user-select",
    "text",
  );
  await card.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Открыть карточку 378879304" })
    .click();
  await expect(card.getByLabel("Объект", { exact: true })).toHaveValue(
    "Учебное здание",
  );
  await expect(card.getByLabel("Код", { exact: true })).toHaveValue("42");
  await expect(
    card.getByRole("button", { name: "Дом многоквартирный", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    question.getByRole("button", { name: "Да", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("link", { name: "Мои занятия", exact: true }).click();
  const list = page.locator("nav ul").first();
  await expect(list).toHaveCSS("list-style-type", "none");
});
