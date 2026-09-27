import { test, expect } from "./auth-fixture";
import type { Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Логин").fill("teacher");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/teacher$/);
}

test("teacher creates standalone memory with visible validation", async ({
  page,
}) => {
  const rows: Record<string, unknown>[] = [];
  await page.route("**/api/v1/assessment-memory?**", (route) =>
    route.fulfill({
      json: { items: rows, total: rows.length, offset: 0, limit: 20 },
    }),
  );
  await page.route("**/api/v1/assessment-memory/criteria", (route) =>
    route.fulfill({
      json: [
        { code: "description", label: "112 — Смысл сообщения", kind: "text" },
        {
          code: "dds.comments",
          label: "ДДС — Комментарии бригад",
          kind: "dds",
        },
      ],
    }),
  );
  await page.route("**/api/v1/assessment-memory", (route) => {
    const body = route.request().postDataJSON();
    rows.push({
      ...body,
      id: "manual",
      kind: "text",
      role: "operator_112",
      source: "teacher",
      active: true,
      enabled: true,
      removed: false,
      embedded_at: null,
      created_at: "2026-09-27T12:00:00Z",
    });
    return route.fulfill({ status: 201, json: rows[0] });
  });
  await login(page);
  await page.goto("/teacher/assessment-memory");
  await page
    .getByRole("button", { name: "Создать разбор", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Сохранить разбор", exact: true })
    .click();
  await expect(page.getByLabel("Условие и известные факты")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(rows).toHaveLength(0);
  await page
    .getByLabel("Условие и известные факты")
    .fill("Очевидец сообщает, что мужчина без сознания, но дышит.");
  await page
    .getByLabel("Пример ответа ученика")
    .fill("Мужчина без сознания, дыхание сохранено.");
  await page
    .getByLabel("Почему такой вердикт верен")
    .fill("Существенные сведения переданы верно, формулировки равнозначны.");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "docs/screenshots/memory-authoring/create-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/memory-authoring/create-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Сохранить разбор", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "Ваш разбор", exact: true }),
  ).toBeVisible();
  expect(rows).toHaveLength(1);
});

test("generation memory lists approved cards and lets teacher disable examples", async ({
  page,
}) => {
  const card = {
    id: "example-card",
    title: "Пожар в мусорном контейнере",
    revision: 1,
    created_at: "2026-09-27T12:00:00Z",
    updated_at: "2026-09-27T12:00:00Z",
    generation_example: true,
    incident_name: "101",
    classifier_label: "Учебный справочник",
    classifier_version_id: "version",
    classifier_entry_id: null,
    can_edit: false,
    scenario_count: 1,
    caller_message: "У дома горит мусорный контейнер. Людей рядом нет.",
    instructions: "Заполните сведения по сообщению заявителя.",
    data: { description: "Горит мусорный контейнер", additional_fields: {} },
    recipients: [],
    recipient_service_ids: [],
  };
  await page.route("**/api/v1/views/cards?**", (route) => {
    const enabled = new URL(route.request().url()).searchParams.get(
      "generation_example",
    );
    const items =
      enabled === null || String(card.generation_example) === enabled
        ? [card]
        : [];
    return route.fulfill({
      json: { items, total: items.length, limit: 20, offset: 0 },
    });
  });
  await page.route("**/api/v1/cards/example-card", (route) =>
    route.fulfill({ json: card }),
  );
  await page.route(
    "**/api/v1/cards/example-card/generation-example",
    (route) => {
      card.generation_example = route.request().postDataJSON().enabled;
      return route.fulfill({ json: card });
    },
  );
  await login(page);
  await page.goto("/teacher/assessment-memory?tab=generation");
  await expect(
    page.getByRole("tab", { name: "Генерация карточек" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("cell", { name: card.title })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.screenshot({
    path: "docs/screenshots/memory-authoring/generation-desktop.png",
    fullPage: true,
  });
  await page.getByRole("cell", { name: card.title }).click();
  await page.getByLabel("Использовать как пример генерации").click();
  await expect(
    page.getByLabel("Использовать как пример генерации"),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(
    page.getByText("Карточек с такими условиями нет.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("Использование для генерации").click();
  await page.getByRole("option", { name: "Все мои карточки" }).click();
  await expect(page.getByRole("cell", { name: card.title })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/memory-authoring/generation-mobile.png",
    fullPage: true,
  });
});
