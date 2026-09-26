import { expect, test } from "./auth-fixture";
import { mockMap } from "./map-fixture";

const address = {
  point: { latitude: 55.7558, longitude: 37.6173 },
  addressLine: "г Москва, ул Тверская, д 1",
  country: "Россия",
  administrativeAreas: ["г Москва"],
  localities: ["Москва"],
  district: "Центральный",
  area: "Тверской",
  street: "ул Тверская",
  house: "1",
  building: "",
  structure: "",
  apartment: "",
};

for (const width of [1366, 390]) {
  test(`map address selection, cancellation and translation at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    let savedLocation: unknown;
    page.on("request", (request) => {
      if (
        request.method() === "PUT" &&
        request.url().endsWith("/student/attempts/attempt/card")
      )
        savedLocation = request.postDataJSON().data.additional_fields.location;
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await mockMap(page);
    await page.route("**/api/v1/addresses/*", (route) =>
      route.fulfill({ json: { items: [address] } }),
    );
    await page.route("**/api/v1/translations/translate", (route) =>
      route.fulfill({
        json: { text: "Нужна помощь", detected_language_code: "en" },
      }),
    );
    await page.goto("/login");
    await page.getByLabel("Логин").fill("student1");
    await page.getByLabel("Пароль").fill("test-password");
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page).toHaveURL(/student$/);
    await page.goto("/student/sessions/lesson");
    await page.getByRole("row", { name: "Карточка 1042", exact: true }).click();
    const card = page.getByRole("dialog", {
      name: "Карточка происшествия № card",
    });
    const street = card.getByLabel("Улица", { exact: true });
    const initialStreet = await street.inputValue();
    await card.getByRole("button", { name: "Показать адрес на карте" }).click();
    const map = page.getByRole("dialog", { name: "Карта происшествия" });
    await map.getByLabel("Найти адрес").fill("Москва Тверская 1");
    await map.getByRole("button", { name: "Найти", exact: true }).click();
    await map.getByRole("button", { name: address.addressLine }).click();
    await map.getByRole("button", { name: "Отмена", exact: true }).click();
    await expect(street).toHaveValue(initialStreet);
    await card.getByRole("button", { name: "Показать адрес на карте" }).click();
    await map.getByLabel("Найти адрес").fill("Москва Тверская 1");
    await map.getByRole("button", { name: "Найти", exact: true }).click();
    await map.getByRole("button", { name: address.addressLine }).click();
    await map.screenshot({
      animations: "disabled",
      path: info.outputPath("map.png"),
    });
    await map.getByRole("button", { name: "Применить адрес" }).click();
    await expect(street).toHaveValue(address.street);
    await card
      .getByRole("button", { name: "Перевести сообщение заявителя" })
      .click();
    const translation = page.getByRole("dialog", { name: "Перевод сообщения" });
    await translation
      .getByLabel("Текст заявителя", { exact: true })
      .fill("Help");
    await translation
      .getByRole("button", { name: "Перевести", exact: true })
      .click();
    await expect(
      translation.getByLabel("Перевод", { exact: true }),
    ).toHaveValue("Нужна помощь");
    // A changed source must not allow applying the previous successful translation.
    await translation
      .getByLabel("Текст заявителя", { exact: true })
      .fill("Help please");
    await expect(
      translation.getByRole("button", { name: "Подставить в карточку" }),
    ).toBeDisabled();
    await translation
      .getByRole("button", { name: "Перевести", exact: true })
      .click();
    await expect(
      translation.getByLabel("Перевод", { exact: true }),
    ).toHaveValue("Нужна помощь");
    await translation.screenshot({ path: info.outputPath("translation.png") });
    await translation
      .getByRole("button", { name: "Подставить в карточку" })
      .click();
    await expect(
      card.getByLabel("Сообщение со слов заявителя", { exact: true }),
    ).toHaveValue("Нужна помощь");
    await card.getByRole("button", { name: "Сохранить черновик" }).click();
    await expect(card.getByText("Черновик сохранён на сервере.")).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Продолжить заполнение" }).click();
    await expect(card.getByLabel("Улица", { exact: true })).toHaveValue(
      address.street,
    );
    await expect(
      card.getByLabel("Сообщение со слов заявителя", { exact: true }),
    ).toHaveValue("Нужна помощь");
    expect(savedLocation).toEqual(address.point);
    expect(errors).toEqual([]);
  });
}

test("missing map key and service failures preserve manual card editing", async ({
  page,
}) => {
  await page.route("**/map-config.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.SYSTEM112_MAP_CONFIG = {};",
    }),
  );
  await page.route("**/api/v1/addresses/*", (route) =>
    route.fulfill({
      status: 503,
      json: { detail: "Address search is temporarily unavailable" },
    }),
  );
  await page.route("**/api/v1/translations/translate", (route) =>
    route.fulfill({
      status: 503,
      json: { detail: "Translation is temporarily unavailable" },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("Логин").fill("student1");
  await page.getByLabel("Пароль").fill("test-password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/student$/);
  await page.goto("/student/sessions/lesson");
  await page.getByRole("row", { name: "Карточка 1042", exact: true }).click();
  const card = page.getByRole("dialog", {
    name: "Карточка происшествия № card",
  });
  await card.getByRole("button", { name: "Показать адрес на карте" }).click();
  const map = page.getByRole("dialog", { name: "Карта происшествия" });
  await expect(map.getByText(/Карта не настроена/)).toBeVisible();
  await map.getByLabel("Найти адрес").fill("Москва");
  await map.getByRole("button", { name: "Найти", exact: true }).click();
  await expect(map.getByText(/Поиск адресов недоступен/)).toBeVisible();
  await map.getByRole("button", { name: "Отмена", exact: true }).click();
  await card
    .getByRole("button", { name: "Перевести сообщение заявителя" })
    .click();
  const translation = page.getByRole("dialog", { name: "Перевод сообщения" });
  await translation.getByLabel("Текст заявителя", { exact: true }).fill("Help");
  await translation
    .getByRole("button", { name: "Перевести", exact: true })
    .click();
  await expect(translation.getByRole("alert")).toContainText(
    "Переводчик сейчас недоступен",
  );
  await expect(
    translation.getByRole("button", { name: "Подставить в карточку" }),
  ).toBeDisabled();
  await translation
    .getByRole("button", { name: "Отмена", exact: true })
    .click();
  await card
    .getByLabel("Сообщение со слов заявителя", { exact: true })
    .fill("Введено вручную");
  await card.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(card.getByText("Черновик сохранён на сервере.")).toBeVisible();
});
