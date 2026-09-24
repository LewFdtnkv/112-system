import { test, expect } from "./auth-fixture";
import options from "./fixtures/generation-options.json" with { type: "json" };

test("teacher chooses anonymous SMS and descriptive address without conflicting fields", async ({
  page,
}) => {
  let parameters: Record<string, unknown> = {};
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/v1/card-generations**", (route) => {
    if (route.request().url().includes("/options"))
      return route.fulfill({ json: options });
    if (route.request().method() === "POST") {
      parameters = route.request().postDataJSON().parameters;
      return route.fulfill({ status: 202, json: [] });
    }
    return route.fulfill({
      json: { items: [], total: 0, limit: 10, offset: 0 },
    });
  });
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill("teacher");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.goto("/cards");
  await page.getByRole("button", { name: "Сгенерировать карточки" }).click();
  const dialog = page.getByRole("dialog");
  const choose = async (label: string, value: string) => {
    await dialog.getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name: value, exact: true }).click();
  };
  await choose("Формат сообщения", "СМС");
  await dialog.getByLabel("Возраст заявителя", { exact: true }).fill("42");
  await dialog
    .getByRole("combobox", { name: "ФИО заявителя", exact: true })
    .fill("Анна");
  await choose("Сведения о заявителе", "Без сведений о заявителе");
  await expect(
    dialog.getByLabel("Возраст заявителя", { exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("combobox", { name: "ФИО заявителя", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("combobox", { name: "Дом", exact: true }).fill("7");
  await choose("Формат адреса", "Описательный адрес, ориентиры");
  await expect(
    dialog.getByRole("combobox", { name: "Дом", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Описательный адрес — ориентиры", { exact: true })
    .fill("За остановкой, рядом с зелёным ограждением");
  await expect(
    dialog.getByRole("combobox", { name: "Нет контакта", exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("combobox", { name: "Срыв звонка", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await dialog
    .getByLabel("Формат адреса", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/message-formats/settings.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog
    .getByLabel("Формат сообщения", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/message-formats/mobile.png",
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Запустить генерацию" }).click();
  await expect(dialog).toHaveCount(0);
  expect(parameters).toMatchObject({
    message_format: "sms",
    caller_information: "anonymous",
    address_format: "descriptive",
    house: null,
    caller_name: null,
    age: null,
    gender: null,
  });
  expect(parameters).not.toHaveProperty("no_contact");
  expect(parameters).not.toHaveProperty("call_dropped");
  expect(errors).toEqual([]);
});
