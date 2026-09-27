import { test, expect } from "./auth-fixture";

const firstId = "10000000-0000-4000-8000-000000000001";
const rows = Array.from({ length: 24 }, (_, i) => ({
  id:
    i === 0
      ? firstId
      : `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  purpose:
    i % 3 === 0 ? "generation" : i % 3 === 1 ? "evaluation" : "recommendation",
  status:
    i === 0
      ? "running"
      : i % 4 === 1
        ? "queued"
        : i % 4 === 2
          ? "succeeded"
          : "failed",
  created_by_id: "teacher",
  created_by_username: i % 2 ? "teacher-ivanov" : "teacher-petrova",
  student_id: "student",
  student_username: "student-smirnov",
  model_version: "qwen3:4b-instruct-2507-q4_K_M",
  retry_count: i === 0 ? 2 : 1,
  created_at: "2026-09-25T09:15:00Z",
  available_at: "2026-09-25T09:15:00Z",
  completed_at: i === 0 || i % 4 === 1 ? null : "2026-09-25T09:18:00Z",
  lease_expires_at: i === 0 ? "2026-09-25T09:17:00Z" : null,
  lease_expired: i === 0,
  generation_method: i === 6 ? "template-fallback" : null,
  error_summary:
    i % 4 === 3
      ? "Модель недоступна. Можно проверить журнал и настройки сервиса."
      : null,
}));

test("admin monitors jobs, filters, reads payloads and receives updates", async ({
  page,
}) => {
  test.setTimeout(90000);
  let administrator = true;
  let completed = false;
  let detailRequests = 0;
  let listRequests = 0;
  let unavailable = false;
  await page.route("**/api/v1/users/me", (r) =>
    r.fulfill({
      json: {
        id: "admin",
        username: "admin",
        first_name: "Администратор",
        last_name: "",
        is_admin: administrator,
        is_teacher: false,
        is_active: true,
        must_change_password: false,
      },
    }),
  );
  await page.route("**/api/v1/admin/ai-jobs**", async (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.endsWith(firstId)) {
      detailRequests++;
      return r.fulfill({
        json: {
          ...rows[0],
          status: completed ? "succeeded" : "running",
          lease_expired: !completed,
          generation_method: completed ? "template-fallback" : null,
          completed_at: completed ? "2026-09-25T09:21:00Z" : null,
          prompt_version: "card-generation-v5",
          idempotency_key: "batch-key",
          card_template_id: completed ? "card" : null,
          scenario_version_id: null,
          attempt_id: null,
          input: {
            facts: { Тип: "Пожар", Адрес: "Москва, Лесная улица, дом 12" },
          },
          context: { examples: ["Образец преподавателя"] },
          output: completed
            ? {
                text: "<script>window.badPayload=true</script>",
                inference: {
                  source: "template-fallback",
                  attempts: [{ rejection: "Не сохранены все факты" }],
                },
              }
            : null,
          error: null,
        },
      });
    }
    listRequests++;
    if (unavailable)
      return r.fulfill({
        status: 503,
        json: { detail: "Сервис временно недоступен" },
      });
    let items = rows.map((row, i) =>
      i === 0 && completed
        ? {
            ...row,
            status: "succeeded",
            lease_expired: false,
            generation_method: "template-fallback",
            completed_at: "2026-09-25T09:21:00Z",
          }
        : row,
    );
    const status = url.searchParams.get("status"),
      purpose = url.searchParams.get("purpose"),
      q = url.searchParams.get("q");
    if (status) items = items.filter((x) => x.status === status);
    if (purpose) items = items.filter((x) => x.purpose === purpose);
    if (q)
      items = items.filter(
        (x) => x.id.includes(q) || x.created_by_username.includes(q),
      );
    const offset = Number(url.searchParams.get("offset") ?? 0);
    return r.fulfill({
      json: {
        items: items.slice(offset, offset + 20),
        total: items.length,
        offset,
        limit: 20,
        summary: {
          queued: 6,
          running: completed ? 0 : 1,
          succeeded: completed ? 7 : 6,
          failed: 11,
        },
        as_of: "2026-09-25T09:20:00Z",
      },
    });
  });
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill("admin");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.goto("/admin/ai-jobs");
  await expect(
    page.getByRole("heading", { name: "ИИ-задачи", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("table", { name: "ИИ-задачи" })).toBeVisible();
  expect(detailRequests).toBe(0);
  await expect(page.getByRole("table")).not.toContainText("10000000");
  await expect(page.getByRole("table")).not.toContainText("qwen3:");
  await expect(page.getByRole("table")).not.toContainText("воркер");
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.screenshot({
    path: "docs/screenshots/interface-copy/table-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Следующая страница" }).click();
  await expect(page).toHaveURL(/offset=20/);
  await page.getByRole("combobox", { name: "Состояние", exact: true }).click();
  await page.getByRole("option", { name: "В работе", exact: true }).click();
  await expect(page).not.toHaveURL(/offset=20/);
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.getByRole("combobox", { name: "Вид задачи", exact: true }).click();
  await page
    .getByRole("option", { name: "Генерация карточки", exact: true })
    .click();
  await expect(page.getByRole("row")).toHaveCount(2);
  const row = page.getByRole("row").nth(1);
  await row.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Данные ИИ-задачи" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(firstId, { exact: true })).not.toBeVisible();
  await expect(
    dialog.getByText("card-generation-v5", { exact: true }),
  ).not.toBeVisible();
  expect(detailRequests).toBeGreaterThan(0);
  await page.waitForTimeout(200);
  await page.screenshot({
    path: "docs/screenshots/interface-copy/detail-desktop.png",
    fullPage: true,
  });
  await dialog.getByText("Технические сведения", { exact: true }).click();
  await expect(dialog.getByText(firstId, { exact: true })).toBeVisible();
  await expect(
    dialog.getByText("card-generation-v5", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("tab", { name: "Входные данные", exact: true })
    .click();
  await expect(dialog.getByRole("tabpanel")).toContainText("Лесная улица");
  await dialog.getByRole("tab", { name: "Результат", exact: true }).click();
  await expect(dialog.getByText("Результат ещё не получен.")).toBeVisible();
  completed = true;
  await expect(dialog.getByRole("tabpanel")).toContainText(
    "Не сохранены все факты",
    { timeout: 12000 },
  );
  expect(await page.evaluate(() => "badPayload" in window)).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await page.screenshot({
    path: "docs/screenshots/interface-copy/detail-mobile.png",
    fullPage: true,
  });
  completed = true;
  await expect
    .poll(() => detailRequests, { timeout: 12000 })
    .toBeGreaterThan(1);
  await dialog.getByText("Технические сведения", { exact: true }).click();
  await expect(dialog.getByText("Успешно", { exact: true })).toBeVisible({
    timeout: 12000,
  });
  await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.goto("/admin/ai-jobs");
  await expect(page.getByRole("table", { name: "ИИ-задачи" })).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/interface-copy/table-mobile.png",
    fullPage: true,
  });
  await page.goto("/admin/ai-jobs?q=absent");
  await expect(page.getByText("ИИ-задачи не найдены.")).toBeVisible();
  unavailable = true;
  await page.getByRole("button", { name: "Обновить", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  unavailable = false;
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(listRequests).toBeGreaterThan(3);
  administrator = false;
  const before = listRequests;
  await page.reload();
  await expect(page).toHaveURL(/403/);
  expect(listRequests).toBe(before);
});
