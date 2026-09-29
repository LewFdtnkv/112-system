import { test, expect } from "./auth-fixture";

const browserName = process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH
  ? "firefox"
  : "chromium";
test.use({
  browserName,
  launchOptions: {
    executablePath:
      browserName === "firefox"
        ? process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH
        : process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  },
});

for (const width of [1440, 390]) {
  test(`card errors identify profile, goals and history at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 1000 });
    const profiles = ["Южное Медведково", "Тверской район"].map(
      (name, index) => ({
        id: `profile-${index}`,
        service_id: `service-${index}`,
        name: `ДДС: ${name}`,
        status: "published",
        version: 1,
        revision: 1,
        contacts: [],
        crews: [{ code: "crew", name: "Учебная бригада № 1", is_active: true }],
      }),
    );
    const entry = {
      id: "entry",
      code: "extra",
      name: "Дополнительный звонок от заявителя",
      notification_required: false,
      conditions: {
        format: "typed-features-v1",
        features: [
          {
            key: "original",
            label: "Номер исходной карточки",
            type: "text",
            required: false,
          },
        ],
      },
    };
    let requests = 0;
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname.replace(
        "/api/v1/",
        "",
      );
      if (path === "views/cards")
        return route.fulfill({
          json: { items: [], total: 0, offset: 0, limit: 20 },
        });
      if (path === "classifiers")
        return route.fulfill({
          json: [{ id: "version", label: "Учебный ЕКП", status: "published" }],
        });
      if (path === "classifiers/version/entries")
        return route.fulfill({ json: [entry] });
      if (path.endsWith("/routes")) return route.fulfill({ json: [] });
      if (path === "services")
        return route.fulfill({
          json: profiles.map((p) => ({ id: p.service_id, name: p.name })),
        });
      if (path === "service-profiles") return route.fulfill({ json: profiles });
      if (path.startsWith("service-profiles/"))
        return route.fulfill({
          json: profiles.find((p) => path.endsWith(p.id)),
        });
      if (path === "cards" && route.request().method() === "POST") {
        requests++;
        const body = route.request().postDataJSON();
        expect(body.data.features.ekp.original).toBeUndefined();
        if (body.dds_exercise.initial_crews[0]?.history[0].status === "arrived")
          return route.fulfill({
            status: 422,
            json: {
              detail: [
                {
                  loc: [
                    "body",
                    "dds_exercise",
                    "initial_crews",
                    0,
                    "history",
                    0,
                    "status",
                  ],
                  type: "card_constraint",
                  msg: "История бригады должна начинаться с назначения и соблюдать порядок статусов.",
                },
              ],
            },
          });
        return route.fulfill({
          status: 201,
          json: { ...body, id: "saved", revision: 1 },
        });
      }
      return route.fallback();
    });
    await page.goto("/login");
    await page.getByLabel("Логин").fill("teacher");
    await page.getByLabel("Пароль", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page).not.toHaveURL(/login$/);
    await page.goto("/cards");
    await page
      .getByRole("button", { name: "Создать карточку", exact: true })
      .click();
    const choose = async (label: string, option: string) => {
      await page.getByRole("combobox", { name: label, exact: true }).click();
      await page.getByRole("option", { name: option, exact: true }).click();
    };
    const save = () =>
      page
        .getByRole("button", { name: "Сохранить карточку", exact: true })
        .click();
    await page
      .getByLabel("Название карточки", { exact: false })
      .fill("Дополнительное сообщение: прибытие бригады");
    await page
      .getByLabel("Сообщение в карточке", { exact: false })
      .fill("Бригада прибыла по адресу.");
    await choose("Опубликованная версия ЕКП", "Учебный ЕКП");
    await choose("Тип происшествия (ЕКП)", entry.name);
    await page.getByLabel("Задать службы эталонного решения вручную").check();
    await choose("Добавить службу в эталонное решение", profiles[0].name);
    await page.getByLabel("Подготовить карточку для оператора ДДС").check();
    await choose("Профиль службы ДДС", profiles[1].name);
    await choose("Учебная цель после начала занятия", "Прибытие");
    await page
      .getByLabel("Новое сообщение для ученика")
      .fill("Бригада прибыла по адресу.");
    await save();
    const profileField = page.locator(
      '[data-validation-field="dds_exercise.service_profile_id"]',
    );
    await expect(profileField).toHaveAttribute("aria-invalid", "true");
    await expect(profileField).toContainText("нет среди получателей карточки");
    await expect(profileField.getByRole("combobox")).toBeFocused();
    expect(requests).toBe(0);
    await page.screenshot({
      path: `docs/screenshots/card-validation/${browserName}-profile-${width}.png`,
      animations: "disabled",
    });
    // Summary remains a navigable list, even when the offending field is lower down.
    await page.locator(".form-validation-summary").scrollIntoViewIfNeeded();
    await expect(page.locator(".form-validation-summary")).toContainText(
      "Тверской район",
    );
    await page.screenshot({
      path: `docs/screenshots/card-validation/${browserName}-summary-${width}.png`,
      animations: "disabled",
    });
    await page.locator(".form-validation-summary button").click();
    await expect(profileField.getByRole("combobox")).toBeFocused();
    await choose("Профиль службы ДДС", profiles[0].name);
    await expect(
      page.getByRole("combobox", {
        name: "Учебная цель после начала занятия",
        exact: true,
      }),
    ).toBeVisible();
    await save();
    await expect(
      page.locator('[data-validation-field="dds_exercise.required_crews"]'),
    ).toHaveAttribute("aria-invalid", "true");
    expect(requests).toBe(0);
    await choose("Учебная цель после начала занятия", "Прибытие");
    await page
      .getByLabel("Новое сообщение для ученика")
      .fill("Бригада прибыла по адресу.");
    await page
      .getByRole("button", { name: "Добавить исходную запись", exact: true })
      .click();
    await choose("Исходный статус 1", "Прибытие");
    await save();
    const history = page.getByRole("combobox", {
      name: "Исходный статус 1",
      exact: true,
    });
    await expect(history).toHaveAttribute("aria-invalid", "true");
    await expect(history).toBeFocused();
    await expect(page.locator(".form-validation-summary")).toContainText(
      "начинаться с назначения",
    );
    expect(requests).toBe(1);
    const ddsSection = page.getByRole("region", {
      name: "Оператор ДДС — работа бригад",
      exact: true,
    });
    expect(
      await ddsSection.evaluate(
        (node) => node.scrollWidth <= node.clientWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `docs/screenshots/card-validation/${browserName}-history-${width}.png`,
      animations: "disabled",
    });
    await choose("Исходный статус 1", "Назначена");
    await save();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(requests).toBe(2);
  });
}
