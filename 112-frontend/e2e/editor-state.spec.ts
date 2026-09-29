import { test, expect } from "./auth-fixture";

for (const role of ["dds", "operator_112"]) {
  test(`scenario preserves cards, order and payload in ${role}`, async ({
    page,
  }) => {
    const cards = ["Пожар", "ДТП", "Утечка газа"].map((title, index) => ({
      id: `card-${index}`,
      title,
    }));
    await page.route("**/api/v1/service-profiles?*", (r) =>
      r.fulfill({ json: [{ id: "profile", name: "Пожарная служба" }] }),
    );
    await page.route("**/api/v1/views/cards?*", (r) =>
      r.fulfill({ json: { items: cards, total: 3, offset: 0, limit: 20 } }),
    );
    let saved: Record<string, unknown> | undefined;
    await page.route("**/api/v1/scenarios", (r) => {
      saved = r.request().postDataJSON();
      return r.fulfill({ json: { id: "new-version" } });
    });
    await page.goto("/login");
    await page.getByLabel("Логин").fill("teacher");
    await page.getByLabel("Пароль", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page).toHaveURL(/teacher$/);
    await page.goto("/scenarios/new");
    const choose = async (label: string, name: string) => {
      await page.getByRole("combobox", { name: label, exact: true }).click();
      await page.getByRole("option", { name, exact: true }).click();
    };
    await expect(page.getByLabel("Название сценария")).toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: "Учебная роль", exact: true }),
    ).not.toContainText(/Оператор 112|Диспетчер ДДС/);
    await choose(
      "Учебная роль",
      role === "dds" ? "Диспетчер ДДС" : "Оператор 112",
    );
    if (role === "dds") {
      await expect(
        page.getByRole("combobox", { name: "Карточка из библиотеки" }),
      ).toHaveCount(0);
      await choose("Профиль службы", "Пожарная служба");
    }
    await page
      .getByLabel("Название сценария")
      .fill("Работа с несколькими карточками");
    for (const card of cards) {
      await choose("Карточка из библиотеки", card.title);
      await expect(
        page.getByRole("button", { name: "Убрать", exact: true }),
      ).toHaveCount(cards.indexOf(card) + 1);
      await expect(
        page.getByRole("combobox", {
          name: "Карточка из библиотеки",
          exact: true,
        }),
      ).toHaveValue("");
    }
    await expect(
      page.getByRole("button", { name: "Добавить карточку", exact: true }),
    ).toHaveCount(0);
    const delays = page.getByLabel("После предыдущей карточки, с");
    if (role === "dds") {
      await delays.nth(0).fill("45");
      await delays.nth(1).fill("90");
    }
    await page
      .getByRole("button", { name: "Вверх: Утечка газа", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Убрать", exact: true })
      .first()
      .click();
    if (role === "dds") {
      await expect(page.getByLabel("Первая карточка — сразу")).toHaveValue("0");
      await expect(delays).toHaveValue("90");
    }
    await page
      .getByLabel("Инструкция ученику")
      .fill("Обработайте поступившие карточки.");
    await page.screenshot({
      path: `docs/screenshots/architecture-refactor-v2/scenario-${role}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Сохранить сценарий", exact: true })
      .click();
    await expect(page).toHaveURL(/scenarios$/);
    expect(saved).toMatchObject({
      title: "Работа с несколькими карточками",
      role,
      card_ids: ["card-2", "card-1"],
      arrival_offsets_seconds: role === "dds" ? [0, 90] : [0, 0],
      service_profile_id: role === "dds" ? "profile" : null,
      dds_policy: null,
      instructions: "Обработайте поступившие карточки.",
    });
  });
}
