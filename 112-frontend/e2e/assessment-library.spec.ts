import { test, expect } from "./auth-fixture";

const example = {
  id: "example",
  criterion_code: "description",
  kind: "text",
  role: "operator_112",
  source: "shared",
  condition:
    "В техническом помещении течёт труба отопления. Помещение обесточили.",
  answer:
    "В техпомещении утечка из отопительной трубы, электропитание отключено.",
  verdict: "correct",
  reason:
    "Утечка и течь равнозначны, отключение электропитания передано верно. Новых фактов нет.",
  active: true,
  enabled: true,
  removed: false,
  created_at: "2026-09-24T09:00:00Z",
  embedded_at: "2026-09-24T09:01:00Z",
};

test("teacher manages shared memory without changing historical evaluations", async ({
  page,
}) => {
  let row = { ...example };
  await page.route("**/api/v1/assessment-memory?**", (route) => {
    const url = new URL(route.request().url());
    const visible =
      !row.removed || url.searchParams.get("include_removed") === "true";
    return route.fulfill({
      json: {
        items: visible ? [row] : [],
        total: visible ? 1 : 0,
        limit: 20,
        offset: 0,
      },
    });
  });
  await page.route("**/api/v1/assessment-memory/example", (route) => {
    if (route.request().method() === "PATCH")
      row = {
        ...row,
        enabled: route.request().postDataJSON().enabled,
        removed: false,
      };
    if (route.request().method() === "DELETE")
      row = { ...row, enabled: false, removed: true };
    return route.fulfill({ json: row });
  });
  await page.goto("/login");
  await page.getByLabel("Логин").fill("teacher");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.goto("/teacher/assessment-memory");
  await expect(page.getByRole("heading", { name: "Память ИИ" })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.screenshot({
    path: "docs/screenshots/assessment-memory/library.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("cell", { name: example.reason }).click();
  await expect(page.getByRole("dialog")).toContainText(example.condition);
  await page.getByRole("button", { name: "Отключить", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Включить", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/assessment-memory/library-detail.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Удалить из памяти", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "В истории прежних оценок его копия сохранится",
  );
  await page.getByRole("button", { name: "Подтвердить удаление" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Разборы не найдены.")).toBeVisible();
  await page.getByLabel("Показывать удалённые").check();
  await page.getByRole("cell", { name: example.reason }).click();
  await page.getByRole("button", { name: "Восстановить и включить" }).click();
  await expect(
    page.getByRole("button", { name: "Отключить", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/assessment-memory/library-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("student cannot open teacher memory", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Логин").fill("student1");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.goto("/teacher/assessment-memory");
  await expect(page).toHaveURL(/403/);
});
