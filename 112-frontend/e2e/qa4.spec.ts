import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";

async function login(page: import("@playwright/test").Page, name: string) {
  await page.goto("/login");
  await page.getByLabel("Логин").fill(name);
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).not.toHaveURL(/login$/);
}

for (const width of [1440, 390]) {
  test(`QA4 separate DDS clocks and required refusal reason ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const base = (await mockBusiness(page)).currentAttempt();
    const start = new Date(Date.now() - 190000).toISOString();
    const opened = new Date(Date.parse(start) + 12000).toISOString();
    const read = {
      ...base,
      role: "dds",
      started_at: start,
      first_opened_at: opened,
      caller_message: null,
      instructions: "Примите входящую карточку и организуйте работу бригады.",
      dds: {
        workflow: "crews-v2",
        card_exercise: true,
        revision: 2,
        response_id: "response",
        status: "received",
        sent_at: start,
        first_decision_at: start,
        allowed_statuses: [],
        can_finish: true,
        history: [],
        comment: "",
        crew_number: null,
        timing: {
          opening: {
            at: opened,
            seconds: 12,
            norm_seconds: 30,
            state: "on_time",
          },
          first_record: {
            at: null,
            seconds: 190,
            norm_seconds: 180,
            state: "overdue",
          },
        },
        information: {
          id: "info",
          message:
            "Руководитель сообщает: нет оборудования для устранения аварии.",
        },
        crew_messages: [
          {
            crew_code: "water",
            message:
              "Бригада не может принять работу: нет оборудования для устранения аварии.",
          },
        ],
        profile: {
          id: "profile",
          service_id: "service",
          name: "Аварийная служба",
          version: 1,
          status: "published",
          responsibility: "Водоснабжение",
          procedure: "",
          territories: [],
          objects: [],
          contacts: [],
          crews: [
            {
              code: "water",
              name: "Аварийная бригада № 1",
              description: "Водоснабжение",
              is_active: true,
            },
          ],
        },
        crews: [
          {
            crew_code: "water",
            name: "Аварийная бригада № 1",
            status: "assigned",
            crew_number: null,
            comment: "",
            status_updated_at: start,
            allowed_statuses: ["accepted", "not_accepted", "cancelled"],
            history: [
              {
                id: "event",
                status: "assigned",
                comment: "",
                at: start,
                operator: "оп.0",
              },
            ],
          },
        ],
        responses: [
          {
            service_id: "service",
            name: "Аварийная служба",
            short_name: "104",
            status: "received",
            added_at: start,
            status_updated_at: start,
            comment: "",
            crew_number: null,
          },
        ],
      },
    };
    await page.route("**/api/v1/student/attempts/attempt", (r) =>
      r.fulfill({ json: read }),
    );
    await page.route("**/api/v1/telephony/attempts/attempt", (r) =>
      r.fulfill({ json: { enabled: false, station: null, calls: [] } }),
    );
    await login(page, "student1");
    await page.goto("/student/sessions/lesson");
    await page
      .getByRole("button", { name: "Продолжить заполнение", exact: true })
      .click();
    await expect(page.locator(".dds-timing-clocks")).toContainText(
      "Открытие карточки",
    );
    await expect(page.locator(".dds-timing-clocks")).toContainText(
      "Статус с текстом",
    );
    await expect(page.locator(".dds-timing-clocks .is-overdue")).toHaveCount(1);
    const runningClock = page.locator(".dds-timing-clocks .is-overdue strong");
    const before = await runningClock.textContent();
    await expect(runningClock).not.toHaveText(before!);
    await page.screenshot({
      path: `docs/screenshots/qa4/dds-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: /Изменить статус бригады/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Статус бригады").selectOption("not_accepted");
    await expect(
      dialog.getByLabel("Причина отказа или отмены"),
    ).toHaveAttribute("required", "");
    await dialog
      .getByLabel("Причина отказа или отмены")
      .fill("Нет оборудования для устранения аварии");
    await page.screenshot({
      path: `docs/screenshots/qa4/refusal-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  });

  test(`QA4 teacher group analysis ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/v1/views/groups*", (r) =>
      r.fulfill({
        json: {
          items: [
            { id: "group", name: "Учебная группа ДДС", student_count: 8 },
          ],
          total: 1,
          limit: 20,
          offset: 0,
        },
      }),
    );
    let created = false;
    await page.route("**/api/v1/teaching/groups/group/analysis*", (r) => {
      if (r.request().method() === "POST") {
        created = true;
        return r.fulfill({
          status: 202,
          json: { id: "job", status: "succeeded" },
        });
      }
      return r.fulfill({
        json: {
          teacher_reviewed_cards: 1,
          statistics: [
            {
              kind: "practice",
              skill: "dds_response",
              label: "Статусы и сообщения бригад",
              students: 8,
              affected: 3,
              cards: 16,
              failed_cards: 4,
              examples: [
                {
                  lesson_id: "lesson",
                  student_id: "student",
                  position: 2,
                  label: "Статусы и сообщения бригад",
                },
              ],
            },
          ],
          job: created
            ? {
                id: "job",
                status: "succeeded",
                obsolete: false,
                mode: "ai",
                recommendations: [
                  {
                    id: "guide",
                    skill: "dds_response",
                    text: "Повторите последовательное отражение подтверждённых состояний бригад. Перед сдачей сверяйте результат с условием.",
                  },
                ],
              }
            : null,
        },
      });
    });
    await login(page, "teacher");
    await page.goto("/groups");
    await page
      .getByRole("button", { name: "Разбор группы", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toContainText("3 из 8");
    await dialog
      .getByRole("button", { name: "Подготовить рекомендации ИИ" })
      .click();
    await expect(dialog).toContainText("Повторите последовательное");
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.screenshot({
      path: `docs/screenshots/qa4/group-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  });
}

test("QA4 address rule edits preserve territories", async ({ page }) => {
  const version = {
    id: "catalog",
    label: "Территориальные правила",
    status: "draft",
    revision: 1,
  };
  const entry = {
    code: "101",
    name: "Пожар",
    section: "Пожары",
    notification_required: true,
    features: [],
    routes: [{ service_code: "fire", is_main: true, when: {} }],
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
    r.fulfill({
      json: {
        items: [
          { id: "fire", code: "fire", name: "Пожарная охрана" },
          { id: "local", code: "local", name: "Территориальная служба" },
        ],
        total: 2,
        offset: 0,
        limit: 20,
      },
    }),
  );
  await page.route("**/api/v1/admin/service-profiles?*", (r) =>
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
  await page.route("**/api/v1/admin/classifiers/catalog/entries/entry", (r) => {
    if (r.request().method() === "PUT") {
      expect(r.request().postDataJSON().entry.routes[1].addresses).toEqual([
        { locality: "Москва", street: "Тверская" },
      ]);
      return r.fulfill({ json: version });
    }
    return r.fulfill({ json: { revision: 1, entry } });
  });
  await login(page, "admin");
  await page.goto("/catalogs");
  await page.getByRole("button", { name: version.label, exact: true }).click();
  await page.getByRole("button", { name: "Пожар", exact: true }).click();
  // General route remains; add a conditional territorial recipient.
  await page
    .getByRole("button", { name: /Добавить.*маршрут|Добавить.*службу/ })
    .last()
    .click();
  const service = page.getByLabel("Служба маршрута 2", { exact: false });
  await service.fill("Территориальная");
  await page.getByRole("option", { name: /Территориальная служба/ }).click();
  await page
    .getByRole("button", { name: "Добавить адресное условие", exact: true })
    .last()
    .click();
  await page.getByLabel("Населённый пункт", { exact: true }).fill("Москва");
  await page.getByLabel("Улица", { exact: true }).fill("Тверская");
  await page.getByLabel("Улица", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/qa4/territory.png",
    animations: "disabled",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Сохранить правило", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Сохранить правило", exact: true }),
  ).toHaveCount(0);
});
