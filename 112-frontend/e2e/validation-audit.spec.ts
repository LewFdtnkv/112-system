import { test, expect } from "./auth-fixture";
import type { Page } from "@playwright/test";
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
async function login(page: Page, user = "teacher") {
  await page.goto("/login");
  await page.getByLabel("Логин").fill(user);
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).not.toHaveURL(/login$/);
}
async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
const shot = (page: Page, name: string) =>
  page.screenshot({
    path: `docs/screenshots/validation-audit/${browserName}-${name}.png`,
    animations: "disabled",
  });

test("DDS schedule and incompatible cards have actionable errors", async ({
  page,
}) => {
  let saves = 0;
  await page.route("**/api/v1/service-profiles?*", (r) =>
    r.fulfill({ json: [{ id: "profile", name: "Пожарная служба" }] }),
  );
  await page.route("**/api/v1/views/cards?*", (r) =>
    r.fulfill({
      json: {
        items: [{ id: "card", title: "Пожар в квартире" }],
        total: 1,
        offset: 0,
        limit: 20,
      },
    }),
  );
  await page.route("**/api/v1/scenarios", (r) => {
    saves++;
    return r.fulfill({
      status: 422,
      json: {
        detail: [
          {
            loc: ["body", "card_ids"],
            type: "form_constraint",
            msg: "Карточка «Пожар в квартире» подготовлена для другого профиля ДДС. Уберите её из сценария или верните соответствующий профиль.",
          },
        ],
      },
    });
  });
  await login(page);
  await page.goto("/scenarios/new");
  await page.getByLabel("Название сценария").fill("Работа пожарной службы");
  await choose(page, "Учебная роль", "Диспетчер ДДС");
  await choose(page, "Профиль службы", "Пожарная служба");
  for (let n = 0; n < 2; n++) {
    await choose(page, "Карточка из библиотеки", "Пожар в квартире");
    await page
      .getByRole("button", { name: "Добавить карточку", exact: true })
      .click();
  }
  await page.getByLabel("Длительность, мин").fill("1");
  await page
    .getByRole("button", { name: "Сохранить сценарий", exact: true })
    .click();
  await expect(
    page.getByLabel("Через сколько секунд после предыдущей"),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".form-validation-summary")).toContainText(
    "Карточка 2 поступает",
  );
  expect(saves).toBe(0);
  await shot(page, "schedule");
  await page.getByLabel("Через сколько секунд после предыдущей").fill("30");
  await page
    .getByRole("button", { name: "Сохранить сценарий", exact: true })
    .click();
  await expect(
    page.locator('[data-validation-field="card_ids"]'),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".form-validation-summary")).toContainText(
    "другого профиля ДДС",
  );
  expect(saves).toBe(1);
  await shot(page, "scenario-cards");
});

test("lesson dates and incompatible skills remain editable after rejection", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/v1/scenarios/scenario", (r) =>
    r.fulfill({
      json: { id: "scenario", role: "operator_112", difficulty: "basic" },
    }),
  );
  await page.route("**/api/v1/lessons/start", (r) => {
    requests++;
    return r.fulfill({
      status: 422,
      json: {
        detail: [
          {
            loc: ["body", "learning", "target_skills"],
            type: "form_constraint",
            msg: "Карточка «Консультация» не содержит данных для навыка «Адрес». Выберите другой сценарий или дополните карточку.",
          },
        ],
      },
    });
  });
  await login(page);
  await page.goto("/training?group=group&scenario=scenario&title=Консультация");
  await page
    .getByLabel("Дата и время начала", { exact: true })
    .fill("2099-01-01T12:00");
  await page
    .getByLabel("Дата и время окончания", { exact: true })
    .fill("2099-01-01T12:00");
  await page
    .getByRole("button", { name: "Назначить задание", exact: true })
    .click();
  await expect(
    page.getByLabel("Дата и время окончания", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".form-validation-summary")).toContainText(
    "позже даты начала",
  );
  await shot(page, "lesson-dates");
  expect(requests).toBe(0);
  await page
    .getByLabel("Дата и время окончания", { exact: true })
    .fill("2099-01-02T12:00");
  await page.getByRole("button", { name: /Отработка навыка/ }).click();
  await page
    .getByRole("button", { name: "Адрес происшествия", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Назначить задание", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Подтвердить назначение", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator('[data-validation-field="learning.target_skills"]'),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".form-validation-summary")).toContainText(
    "«Консультация»",
  );
  expect(requests).toBe(1);
  const skillsError = page.locator(
    '[data-validation-field="learning.target_skills"] .field-validation-message',
  );
  await expect(skillsError).toBeInViewport();
  await shot(page, "lesson-skills");
});

test("catalog nested validation points to the actual feature options", async ({
  page,
}) => {
  const version = {
    id: "catalog",
    label: "Проверка правил ЕКП",
    status: "draft",
    revision: 1,
  };
  const entry = {
    code: "101",
    name: "Пожар",
    section: "Пожары",
    notification_required: false,
    features: [
      { key: "place", label: "Место", type: "choice", options: ["Дом", "Дом"] },
    ],
    routes: [],
  };
  await page.route("**/api/v1/users/me", (r) =>
    r.fulfill({
      json: {
        id: "admin",
        username: "admin",
        is_admin: true,
        is_teacher: false,
        is_active: true,
        must_change_password: false,
      },
    }),
  );
  await page.route("**/api/v1/views/admin/classifiers?*", (r) =>
    r.fulfill({ json: { items: [version], total: 1, offset: 0, limit: 20 } }),
  );
  await page.route("**/api/v1/views/admin/services?*", (r) =>
    r.fulfill({ json: { items: [], total: 0, offset: 0, limit: 20 } }),
  );
  await page.route("**/api/v1/views/admin/service-profiles?*", (r) =>
    r.fulfill({ json: { items: [], total: 0, offset: 0, limit: 20 } }),
  );
  await page.route("**/api/v1/admin/classifiers/catalog/entries?*", (r) =>
    r.fulfill({
      json: {
        items: [{ id: "entry", ...entry }],
        version,
        total: 1,
        offset: 0,
        limit: 20,
      },
    }),
  );
  let saves = 0;
  await page.route("**/api/v1/admin/classifiers/catalog/entries/entry", (r) => {
    if (r.request().method() === "PUT") {
      saves++;
      if (saves === 1)
        return r.fulfill({
          status: 422,
          json: {
            detail: [
              {
                loc: ["body", "entry", "features", 0],
                type: "value_error",
                msg: "Value error, Feature options must be unique",
              },
            ],
            field_errors: [{
              path: "entry.features.0.options",
              code: "value_error",
              message: "Варианты признака повторяются. Оставьте каждый вариант один раз.",
            }],
          },
        });
      return r.fulfill({ json: version });
    }
    return r.fulfill({ json: { revision: 1, entry } });
  });
  await login(page, "admin");
  await page.goto("/catalogs");
  await page.getByRole("button", { name: version.label, exact: true }).click();
  await page.getByRole("button", { name: "Пожар", exact: true }).click();
  await page
    .getByRole("button", { name: "Сохранить правило", exact: true })
    .click();
  const options = page.getByLabel("Варианты признака 1", { exact: false });
  await expect(options).toHaveAttribute("aria-invalid", "true");
  await expect(options).toBeFocused();
  await expect(page.locator(".form-validation-summary")).toContainText(
    "повторяются",
  );
  await shot(page, "catalog-options");
  await options.fill("Дом\nУлица");
  await page
    .getByRole("button", { name: "Сохранить правило", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Сохранить правило", exact: true }),
  ).toHaveCount(0);
  expect(saves).toBe(2);
});
