import { test, expect } from "./auth-fixture";

test("scenario requires a role and profile before querying cards; changing them clears incompatible selections", async ({
  page,
}) => {
  const requests: URL[] = [];
  await page.route("**/api/v1/service-profiles?*", (r) =>
    r.fulfill({
      json: [
        { id: "fire", name: "Пожарная служба" },
        { id: "gas", name: "Газовая служба" },
      ],
    }),
  );
  await page.route("**/api/v1/views/cards?*", (r) => {
    const url = new URL(r.request().url());
    requests.push(url);
    const items =
      url.searchParams.get("dds_profile_id") === "fire"
        ? [{ id: "fire-card", title: "Пожар в доме" }]
        : [];
    return r.fulfill({
      json: { items, total: items.length, offset: 0, limit: 20 },
    });
  });
  const choose = async (label: string, name: string) => {
    await page.getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name, exact: true }).click();
  };
  await page.goto("/login");
  await page.getByLabel("Логин").fill("teacher");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/teacher$/);
  await page.goto("/scenarios/new");
  await expect(
    page.getByRole("combobox", { name: "Учебная роль", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Название сценария")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Сохранить сценарий" }),
  ).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await page.screenshot({
    path: "docs/screenshots/scenario-selection/role.png",
    fullPage: true,
    animations: "disabled",
  });
  await choose("Учебная роль", "Диспетчер ДДС");
  await expect(
    page.getByRole("combobox", { name: "Профиль службы", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Название сценария")).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await page.screenshot({
    path: "docs/screenshots/scenario-selection/profile.png",
    fullPage: true,
    animations: "disabled",
  });
  await choose("Профиль службы", "Газовая служба");
  const cardPicker = page.getByRole("combobox", {
    name: "Карточка из библиотеки",
    exact: true,
  });
  await cardPicker.click();
  await expect(
    page.getByText("Для выбранного профиля службы пока нет карточек.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/scenario-selection/empty.png",
    fullPage: true,
    animations: "disabled",
  });
  await cardPicker.fill("Несуществующая карточка");
  await expect(
    page.getByText("Совпадений нет. Уточните поиск.", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await choose("Профиль службы", "Пожарная служба");
  await expect(cardPicker).toHaveValue("");
  await choose("Карточка из библиотеки", "Пожар в доме");
  await page.getByLabel("Название сценария").fill("Реагирование на пожар");
  const remove = page.getByRole("button", { name: "Убрать", exact: true });
  await expect(remove).toHaveCount(1);
  await choose("Профиль службы", "Газовая служба");
  const dialog = page.getByRole("dialog", {
    name: "Изменить настройки сценария?",
  });
  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(remove).toHaveCount(1);
  await choose("Профиль службы", "Газовая служба");
  await dialog.getByRole("button", { name: "Изменить", exact: true }).click();
  await expect(remove).toHaveCount(0);
  await expect(page.getByLabel("Название сценария")).toHaveValue(
    "Реагирование на пожар",
  );
  expect(
    requests.every((url) =>
      ["fire", "gas"].includes(url.searchParams.get("dds_profile_id") ?? ""),
    ),
  ).toBe(true);
  await choose("Профиль службы", "Пожарная служба");
  await choose("Карточка из библиотеки", "Пожар в доме");
  await choose("Учебная роль", "Оператор 112");
  await dialog.getByRole("button", { name: "Изменить", exact: true }).click();
  await expect(remove).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Профиль службы", exact: true }),
  ).toHaveCount(0);
});
