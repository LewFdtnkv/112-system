import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";

for (const width of [1440, 390]) {
  test(`DDS generation is separate and preserves card on failure at ${width}`, async ({
    page,
  }) => {
    await mockBusiness(page);
    await page.setViewportSize({ width, height: 1000 });
    const profile = {
      id: "profile",
      service_id: "fire",
      name: "Пожарная служба 101",
      status: "published",
      crews: [{ code: "crew", name: "Пожарный расчёт № 1", is_active: true }],
      contacts: [],
    };
    const card = {
      id: "dds-source",
      title: "Пожар мусорного контейнера",
      revision: 1,
      can_edit: true,
      scenario_count: 0,
      classifier_label: "Москва",
      classifier_entry: { name: "Пожар", conditions: {} },
      caller_message: "Во дворе горит мусорный контейнер.",
      data: {
        address_text: "Москва, Лесная, 12",
        description: "Пожар мусора",
        additional_fields: {},
      },
      recipient_service_ids: ["fire"],
      recipients: [
        { service_id: "fire", name: "Пожарная служба", short_name: "101" },
      ],
      dds_exercise: null,
    };
    let jobs: Record<string, unknown>[] = [];
    let sent: Record<string, unknown> | undefined;
    await page.route("**/api/v1/**", async (r) => {
      const path = new URL(r.request().url()).pathname.replace("/api/v1/", "");
      if (path === "views/cards")
        return r.fulfill({
          json: { items: [card], total: 1, offset: 0, limit: 20 },
        });
      if (path === "cards/dds-source") return r.fulfill({ json: card });
      if (path === "cards/dds-source/dds-generations") {
        if (r.request().method() === "POST") {
          sent = r.request().postDataJSON();
          jobs = [
            {
              id: `job-${jobs.length + 1}`,
              kind: "dds_generation",
              status: "queued",
              title: card.title,
              card_template_id: card.id,
              incident_name: "Упражнение ДДС",
              address_text: card.data.address_text,
              services: [profile.name],
              created_at: new Date().toISOString(),
            },
            ...jobs,
          ];
          return r.fulfill({ status: 202, json: jobs[0] });
        }
        return r.fulfill({ json: jobs });
      }
      if (path === "card-generations")
        return r.fulfill({
          json: {
            items: jobs.filter(
              (job) =>
                job.status !== "succeeded" &&
                !jobs.some(
                  (newer) =>
                    newer.status === "succeeded" &&
                    String(newer.created_at) > String(job.created_at),
                ),
            ),
            total: jobs[0]?.status === "succeeded" ? 0 : jobs.length,
            offset: 0,
            limit: 10,
          },
        });
      if (path === "service-profiles") return r.fulfill({ json: [profile] });
      if (path === "service-profiles/profile")
        return r.fulfill({ json: profile });
      return r.fallback();
    });
    await page.goto("/login");
    await page.getByLabel("Логин").fill("teacher");
    await page.getByLabel("Пароль", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page).not.toHaveURL(/login$/);
    await page.goto("/cards");
    await page.getByRole("button", { name: card.title, exact: true }).click();
    await page
      .getByRole("navigation", { name: "Разделы карточки" })
      .getByRole("button", {
        name: "Оператор ДДС — работа бригад",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: "Сгенерировать упражнение ДДС",
        exact: true,
      })
      .click();
    await page.getByRole("combobox", { name: /Профиль службы ДДС/ }).click();
    await page.getByRole("option", { name: profile.name }).click();
    await page.getByLabel("Состояние к началу").click();
    await page.getByRole("option", { name: "Начало реагирования" }).click();
    await page.getByLabel("Учебная цель").click();
    await page.getByRole("option", { name: "Работы завершены" }).click();
    await page.screenshot({
      path: `docs/screenshots/dds-generation/form-${width}.png`,
      animations: "disabled",
    });
    const dialog = page.getByRole("dialog").last();
    await expect(dialog).not.toContainText("Поиск на сервере");
    expect(
      await dialog.evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Запустить генерацию ДДС", exact: true })
      .click();
    await expect.poll(() => sent?.target_status).toBe("completed");
    expect(sent?.initial_status).toBe("responding");
    expect(sent?.crew_codes).toBeNull();
    await expect(page.getByText(/Генерация ДДС в очереди/)).toBeVisible();
    jobs[0] = {
      ...jobs[0],
      status: "failed",
      error:
        "Упражнение ДДС не прошло проверку. Карточка сохранена без изменений.",
    };
    await expect(
      page.getByText(/Упражнение ДДС не прошло проверку/),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole("button", {
        name: "Сгенерировать упражнение ДДС",
        exact: true,
      }),
    ).toBeEnabled();
    await page.screenshot({
      path: `docs/screenshots/dds-generation/failure-${width}.png`,
      animations: "disabled",
    });
    const firstRequestId = sent?.request_id;
    await page
      .getByRole("button", {
        name: "Сгенерировать упражнение ДДС",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Запустить генерацию ДДС", exact: true })
      .click();
    await expect.poll(() => jobs.length).toBe(2);
    expect(sent?.request_id).not.toBe(firstRequestId);
    await expect(page.getByText(/Генерация ДДС в очереди/)).toBeVisible();
    jobs[0] = { ...jobs[0], status: "succeeded" };
    await expect(page.getByText(/Упражнение ДДС подготовлено/)).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByText(/Упражнение ДДС не прошло проверку/),
    ).toHaveCount(0);
    await page.screenshot({
      path: `docs/screenshots/dds-generation/retry-success-${width}.png`,
      animations: "disabled",
    });
    await page.reload();
    await expect(
      page.getByRole("button", { name: card.title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Ошибка генерации", { exact: true }),
    ).toHaveCount(0);
  });
}
