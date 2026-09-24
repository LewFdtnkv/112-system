import { test, expect } from "./auth-fixture";
import options from "./fixtures/generation-options.json" with { type: "json" };

test("custom applicant facts are preserved and Moscow house choices follow the street", async ({
  page,
}) => {
  let parameters: Record<string, unknown> = {};
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
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
  await page.route("**/api/v1/classifiers?*", (route) =>
    route.fulfill({ json: [] }),
  );
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
    await expect(page.getByRole("listbox")).toHaveCount(0);
  };
  await choose("Формат адреса", "Улица и номер дома");
  const address = options.addresses[0];
  await dialog
    .getByRole("combobox", { name: "Улица", exact: true })
    .fill(address.street);
  await page.getByRole("option", { name: address.street, exact: true }).click();
  await dialog.getByRole("combobox", { name: "Дом", exact: true }).click();
  const houses = options.addresses
    .filter((a) => a.street === address.street)
    .map((a) => a.house);
  await expect(page.getByRole("option")).toHaveCount(new Set(houses).size + 1);
  await page.getByRole("option", { name: address.house, exact: true }).click();
  const second = options.addresses.find((a) => a.street !== address.street)!;
  await dialog
    .getByRole("combobox", { name: "Улица", exact: true })
    .fill(second.street);
  await page.getByRole("option", { name: second.street, exact: true }).click();
  await expect(
    dialog.getByRole("combobox", { name: "Дом", exact: true }),
  ).toHaveValue("Случайно");
  await choose("Дом", second.house);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await dialog
    .getByText("Место происшествия", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/generation-catalogs/addresses.png",
    fullPage: true,
    animations: "disabled",
  });
  await choose("Сведения о заявителе", "ФИО или ФИ, пол и возраст");
  const name = dialog.getByRole("combobox", {
    name: "ФИО заявителя",
    exact: true,
  });
  const male = "Иванов Александр";
  await name.fill(male);
  await name.press("Tab");
  await choose("Пол заявителя", "Мужской");
  await expect(name).toHaveValue(male);
  await dialog
    .getByText("Заявитель и подача сообщения", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/generation-catalogs/callers.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await name.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/generation-catalogs/mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Запустить генерацию" }).click();
  await expect(dialog).toHaveCount(0);
  expect(parameters).toMatchObject({
    caller_name: male,
    gender: "male",
    street: second.street,
    house: second.house,
  });
  expect(errors).toEqual([]);
});
