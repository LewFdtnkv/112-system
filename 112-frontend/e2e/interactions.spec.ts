import { test, expect } from "./auth-fixture";

const entry = {
  id: "entry",
  classifier_version_id: "version",
  code: "101",
  name: "Пожар",
  display_name: "101",
  section: "Пожар",
  notification_required: true,
  conditions: { features: [] },
};
const recipient = {
  service_id: "service",
  short_name: "101",
  name: "Учебная пожарно-спасательная служба",
};
const card = {
  id: "library-card",
  title: "Дым из окна жилого дома",
  revision: 1,
  classifier_version_id: "version",
  classifier_entry_id: "entry",
  classifier_label: "Учебный ЕКП",
  classifier_entry: entry,
  can_edit: true,
  scenario_count: 0,
  caller_message:
    "На Учебной улице, дом 7, дым из окна второго этажа. Людей в окне не видно.",
  instructions: "Заполните карточку и определите службы для оповещения.",
  data: {
    address_text: "Учебная улица, д. 7",
    address_details: { street: "Учебная улица", house: "7" },
    caller_name: "Иван Петров",
    caller_phone: "+7 900 000-00-01",
    description: "Дым из окна второго этажа",
    features: { ekp: {} },
  },
  recipients: [recipient],
  incident_name: "101",
  address_text: "Учебная улица, д. 7",
  updated_at: "2026-09-21T10:00:00Z",
};

test("whole card rows, nested editing, hover, focus and press feedback", async ({
  page,
}, info) => {
  let updated: Record<string, unknown> | undefined;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1/", "");
    if (path === "views/cards")
      return route.fulfill({
        json: { items: [card], total: 1, offset: 0, limit: 20 },
      });
    if (path === "cards/library-card") {
      if (request.method() === "PUT") updated = request.postDataJSON();
      return route.fulfill({ json: card });
    }
    if (path === "card-generations")
      return route.fulfill({
        json: { items: [], total: 0, offset: 0, limit: 10 },
      });
    if (path === "classifiers")
      return route.fulfill({ json: [{ id: "version", label: "Учебный ЕКП" }] });
    if (path === "classifiers/version/entries")
      return route.fulfill({ json: [entry] });
    if (path.endsWith("/routes"))
      return route.fulfill({
        json: [
          {
            service_id: "service",
            service_name: recipient.name,
            conditions: {},
          },
        ],
      });
    return route.fallback();
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/login");
  await page.getByLabel("Логин").fill("teacher");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  const login = page.getByRole("button", { name: "Войти" });
  await expect(login).toHaveCSS("transition-duration", /0\.15s/);
  await login.hover();
  await expect(login).toHaveCSS("filter", "brightness(0.96)");
  await page.mouse.down();
  await expect(login).toHaveCSS("filter", "brightness(0.9)");
  await page.screenshot({
    path: info.outputPath("pressed-login.png"),
    animations: "disabled",
  });
  await page.mouse.up();
  await expect(page).toHaveURL(/teacher$/);
  await page.goto("/cards");
  const row = page.getByRole("row").filter({ hasText: card.title });
  await row.hover();
  await expect(row).toHaveCSS("filter", "brightness(0.96)");
  await page.screenshot({
    path: info.outputPath("cards-hover.png"),
    animations: "disabled",
  });
  // Click an ordinary address cell, not the title button.
  await row.getByRole("cell").nth(2).click();
  await expect(page.getByRole("dialog")).toContainText("Эталонное решение");
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Tab");
  await row.focus();
  await expect(row).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Эталонное решение");
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await row.getByRole("button", { name: /Редактировать карточку/ }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Редактирование карточки",
  );
  const street = page.getByLabel("Улица", { exact: true });
  await expect(street).toHaveValue("Учебная улица");
  await expect(street).toHaveCSS("user-select", "text");
  await street.fill("Новая учебная улица");
  await page.screenshot({
    path: info.outputPath("card-editor.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(updated).toMatchObject({
    revision: 1,
    data: { address_details: { street: "Новая учебная улица", house: "7" } },
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(row).toHaveCSS("transition-duration", /^(0s)(, 0s)*$/);
});
