import { test, expect } from "./auth-fixture";

test("teacher explicitly approves and withdraws a generation example", async ({
  page,
}) => {
  let enabled = false;
  let fail = false;
  const card = {
    id: "example",
    title: "Пожар мусора во дворе",
    revision: 1,
    created_at: "2026-09-25T09:00:00Z",
    updated_at: "2026-09-25T09:00:00Z",
    classifier_version_id: "version",
    classifier_entry_id: "fire",
    classifier_label: "ЕКП",
    can_edit: false,
    scenario_count: 1,
    generated_by_ai: true,
    generation_method: "assisted",
    caller_message:
      "Алло, у нас во дворе мусор горит! Дым идёт, пламя хорошо видно. Это Москва, Лесная улица, дом 12. Никто не пострадал, подъехать сюда можно. Меня зовут Анна Иванова.",
    instructions: "",
    recipient_service_ids: ["service"],
    recipients: [
      { service_id: "service", short_name: "101", name: "Пожарная служба" },
    ],
    classifier_entry: {
      id: "fire",
      name: "Пожар",
      display_name: "Пожар",
      conditions: {},
    },
    data: {
      caller_name: "Анна Иванова",
      address_text: "Москва, Лесная улица, дом 12",
      description:
        "На улице горит мусор, видно пламя и дым. Пострадавших нет. Проезд свободен.",
      additional_fields: { details: { hasVictims: false, blocked: false } },
    },
  };
  await page.route("**/api/v1/views/cards**", (r) =>
    r.fulfill({
      json: {
        items: [
          {
            ...card,
            incident_name: "Пожар",
            address_text: card.data.address_text,
          },
        ],
        total: 1,
        offset: 0,
        limit: 20,
      },
    }),
  );
  await page.route("**/api/v1/card-generations**", (r) =>
    r.fulfill({ json: { items: [], total: 0, offset: 0, limit: 10 } }),
  );
  await page.route("**/api/v1/cards/example**", async (r) => {
    if (r.request().method() === "PUT") {
      expect(r.request().postDataJSON().revision).toBe(1);
      if (fail)
        return r.fulfill({
          status: 409,
          json: { detail: "Карточка изменилась. Обновите её." },
        });
      enabled = r.request().postDataJSON().enabled;
    }
    return r.fulfill({ json: { ...card, generation_example: enabled } });
  });
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill("teacher");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.goto("/cards");
  await page.getByRole("button", { name: card.title, exact: true }).click();
  const checkbox = page.getByRole("checkbox", {
    name: "Использовать как пример генерации",
  });
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await page.setViewportSize({ width: 1440, height: 1050 });
  await checkbox.scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  await page.screenshot({
    path: "docs/screenshots/generation-prose/examples-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkbox.scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  await page.screenshot({
    path: "docs/screenshots/generation-prose/examples-mobile.png",
    fullPage: true,
  });
  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();
  fail = true;
  await checkbox.check();
  await expect(
    page.getByText(
      "Данные изменились или такая запись уже существует. Обновите список и проверьте введённые значения.",
    ),
  ).toBeVisible();
  await expect(checkbox).not.toBeChecked();
});
