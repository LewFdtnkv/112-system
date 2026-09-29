import { test, expect } from "./auth-fixture";
import options from "./fixtures/generation-options.json" with { type: "json" };

test("generation highlights invalid count and preserves values through correction", async ({
  page,
}) => {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/v1/classifiers?*", (route) =>
    route.fulfill({
      json: [{ id: "version", label: "112 Москва — учебный справочник" }],
    }),
  );
  await page.route("**/api/v1/classifiers/version/entries*", (route) =>
    route.fulfill({
      json: [
        {
          id: "medical",
          name: "103",
          display_name: "103",
          conditions: { features: [] },
        },
      ],
    }),
  );
  await page.route("**/api/v1/card-generations**", async (route) => {
    if (route.request().url().includes("/options"))
      return route.fulfill({ json: options });
    if (route.request().method() !== "POST")
      return route.fulfill({
        json: { items: [], total: 0, limit: 10, offset: 0 },
      });
    const body = route.request().postDataJSON();
    requests.push(body.parameters);
    if (body.parameters.victims_count === 2) {
      return route.fulfill({
        status: 422,
        json: {
          detail: [
            {
              loc: ["body", "parameters", "victims_count"],
              type: "generation_constraint",
              msg: "Для выбранного типа доступны заготовки максимум на 1 пострадавших. Уменьшите количество или создайте карточку вручную.",
            },
          ],
        },
      });
    }
    return route.fulfill({ status: 202, json: [] });
  });
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill("teacher");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/teacher$/);
  await page.goto("/cards");
  await page.getByRole("button", { name: "Сгенерировать карточки" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Версия ЕКП", exact: true })
    .click();
  await page
    .getByRole("option", { name: "112 Москва — учебный справочник" })
    .click();
  const count = dialog.getByLabel("Количество пострадавших", { exact: true });
  await count.fill("5");
  await dialog.getByLabel("Возраст заявителя", { exact: true }).fill("90");
  await dialog
    .getByRole("combobox", { name: "Населённый пункт", exact: true })
    .fill("москва");
  await dialog
    .getByRole("combobox", { name: "Населённый пункт", exact: true })
    .press("Tab");
  await dialog
    .getByRole("combobox", { name: "Пострадавшие", exact: true })
    .click();
  await page.getByRole("option", { name: "Да", exact: true }).click();
  const submit = dialog.getByRole("button", { name: "Запустить генерацию" });
  await submit.click();
  await expect(count).toHaveAttribute("aria-invalid", "true");
  await expect(count).toBeFocused();
  await expect(dialog.locator(".form-validation-summary")).toContainText(
    "Количество пострадавших: Введите значение не больше 3.",
  );
  expect(requests).toHaveLength(0);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await count.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/generation-validation/count-desktop.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await count.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/generation-validation/count-mobile.png",
    animations: "disabled",
  });
  await dialog
    .getByRole("combobox", { name: "Тип происшествия", exact: true })
    .click();
  await page.getByRole("option", { name: "103", exact: true }).click();
  await count.fill("2");
  await expect(count).not.toHaveAttribute("aria-invalid", "true");
  await submit.click();
  await expect(count).toHaveAttribute("aria-invalid", "true");
  await expect(count).toBeFocused();
  await expect(dialog.locator(".form-validation-summary")).toContainText(
    "максимум на 1",
  );
  await expect(
    dialog.getByLabel("Возраст заявителя", { exact: true }),
  ).toHaveValue("90");
  await page.setViewportSize({ width: 1440, height: 1050 });
  await count.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/generation-validation/server-field-error.png",
    animations: "disabled",
  });
  await count.fill("1");
  await submit.click();
  await expect(dialog).toHaveCount(0);
  expect(requests.at(-1)).toMatchObject({
    victims_count: 1,
    has_victims: true,
    age: 90,
    locality: "москва",
  });
});
