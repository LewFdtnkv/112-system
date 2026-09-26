import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";
import type { DDSContext } from "../src/entities/training";

const profile = {
  id: "profile",
  service_id: "service",
  name: "ДДС службы 101",
  version: 1,
  revision: 1,
  status: "published",
  responsibility: "Пожарная охрана",
  procedure: "Работайте с бригадами своей службы.",
  territories: [],
  objects: [],
  contacts: [],
  crews: [
    {
      code: "fire-1",
      name: "Пожарный расчёт № 1",
      is_active: true,
      description: "Учебный район",
      contact_code: null,
    },
  ],
};
async function login(
  page: import("@playwright/test").Page,
  username = "student1",
) {
  await page.goto("/login");
  await page.getByLabel("Логин").fill(username);
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).not.toHaveURL(/login$/);
}
for (const width of [1440, 390]) {
  test(`prepared DDS history and crew report stay separate at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const base = (await mockBusiness(page)).currentAttempt();
    const now = new Date().toISOString();
    const before = new Date(Date.now() - 300000).toISOString();
    const dds: DDSContext = {
      card_exercise: true,
      workflow: "crews-v1",
      revision: 1,
      response_id: "response",
      status: "received",
      goal: "Обработать бригады по сведениям задания",
      sent_at: now,
      first_decision_at: null,
      allowed_statuses: [],
      can_finish: true,
      comment: "",
      crew_number: null,
      history: [],
      profile,
      information: {
        id: "info",
        message:
          "Вы приняли карточку в работу. Бригады уже работают: изучите их историю в нижней панели и обработайте новые сообщения.",
      },
      crew_messages: [
        {
          crew_code: "fire-1",
          message: "Расчёт прибыл по адресу. Требуется зафиксировать прибытие.",
        },
      ],
      crews: [
        {
          id: "crew",
          crew_code: "fire-1",
          name: "Пожарный расчёт № 1",
          description: "",
          contact_code: null,
          status: "responding",
          comment: "Выехали",
          crew_number: "УЧ-101",
          status_updated_at: before,
          allowed_statuses: ["arrived", "cancelled"],
          history: [
            {
              id: "history-1",
              at: before,
              prepared: true,
              status: "assigned",
              comment: "Руководитель оповещён предыдущей сменой",
              crew_number: "УЧ-101",
            },
            {
              id: "history-2",
              at: before,
              prepared: true,
              status: "responding",
              comment: "Выехали",
              crew_number: "УЧ-101",
            },
          ],
        },
      ],
      responses: [
        {
          service_id: "service",
          name: "Пожарно-спасательная служба",
          short_name: "Служба 101",
          status: "received",
          added_at: now,
          comment: "",
          crew_number: null,
        },
      ],
    };
    const read = () => ({ ...base, role: "dds", instructions: "", dds });
    await page.route("**/api/v1/student/attempts/attempt", (r) =>
      r.fulfill({ json: read() }),
    );
    await page.route("**/api/v1/telephony/attempts/attempt", (r) =>
      r.fulfill({ json: { enabled: false, station: null, calls: [] } }),
    );
    await page.route("**/api/v1/student/attempts/attempt/dds/crews", (r) => {
      const body = r.request().postDataJSON();
      expect(body.status).toBe("arrived");
      dds.crews![0].status = "arrived";
      dds.crews![0].history.push({
        id: "student-event",
        at: now,
        status: body.status,
        comment: body.comment,
        crew_number: body.crew_number,
      });
      dds.revision++;
      return r.fulfill({ json: read() });
    });
    await login(page);
    await page.goto("/student/sessions/lesson");
    await page
      .getByRole("button", { name: "Продолжить заполнение", exact: true })
      .click();
    await expect(page.locator(".dds-response-panel")).toHaveCount(0);
    await page.getByRole("button", { name: /^Пожарный расчёт № 1/ }).click();
    const panel = page.getByRole("region", { name: "История бригады" });
    await expect(panel).toContainText(
      "Руководитель оповещён предыдущей сменой",
    );
    await expect(panel).toContainText("Расчёт прибыл по адресу");
    await expect(panel.locator(".dds-history")).not.toContainText("Прибытие");
    await expect(page.locator(".training-panel")).not.toContainText(
      "Расчёт прибыл по адресу",
    );
    await page.screenshot({
      path: `docs/screenshots/dds-card-history/arm-${width}.png`,
      animations: "disabled",
    });
    await page
      .getByRole("button", {
        name: "Изменить статус бригады «Пожарный расчёт № 1»",
      })
      .click();
    await page
      .getByLabel("Статус бригады", { exact: true })
      .selectOption("arrived");
    await page.getByRole("button", { name: "Сохранить статус" }).click();
    await expect(panel.locator(".dds-history")).toContainText("Прибытие");
    await expect(
      page.getByRole("button", { name: /^Служба 101/ }),
    ).toContainText("Добавлена");
    if (width === 1440) {
      dds.crews = [];
      await page.goto("/student/sessions/lesson");
      await page
        .getByRole("button", { name: "Продолжить заполнение", exact: true })
        .click();
      await expect(
        page.getByRole("region", { name: "Сообщения по бригадам" }),
      ).toContainText("Расчёт прибыл по адресу");
      await expect(page.locator(".dds-response-panel")).toHaveCount(0);
      await page.screenshot({
        path: "docs/screenshots/dds-card-history/unassigned.png",
        animations: "disabled",
      });
    }
  });
}

test("teacher edits card-local history and a separate incoming report", async ({
  page,
}) => {
  const exercise = {
    service_profile_id: "profile",
    crew_calls_required: false,
    initial_crews: [
      {
        crew_code: "fire-1",
        history: [
          {
            status: "assigned",
            seconds_before_start: 300,
            crew_number: "УЧ-101",
            comment: "Подготовлено предыдущей сменой",
          },
        ],
      },
    ],
    required_crews: [{ crew_code: "fire-1", status: "arrived" }],
    messages: [
      { crew_code: "fire-1", message: "Расчёт прибыл по адресу." },
      { crew_code: "fire-1", message: "Требуется зафиксировать прибытие." },
    ],
  };
  const card = {
    id: "library-card",
    title: "ДДС: передача смены",
    revision: 1,
    classifier_version_id: "version",
    classifier_entry_id: "entry",
    classifier_label: "Учебный ЕКП",
    classifier_entry: {
      id: "entry",
      code: "101",
      name: "Пожар",
      conditions: {},
    },
    can_edit: true,
    scenario_count: 0,
    caller_message: "Дым из окна",
    instructions: "",
    dds_exercise: exercise,
    data: {
      description: "Пожар в доме",
      address_text: "Лесная, 12",
      address_details: { street: "Лесная", house: "12" },
      additional_fields: {},
    },
    recipients: [{ service_id: "service", name: "Служба 101" }],
    recipient_service_ids: ["service"],
  };
  let saved: typeof exercise | undefined;
  await page.route("**/api/v1/**", async (r) => {
    const path = new URL(r.request().url()).pathname.replace("/api/v1/", "");
    if (path === "views/cards")
      return r.fulfill({
        json: { items: [card], total: 1, offset: 0, limit: 20 },
      });
    if (path === "cards/library-card") {
      if (r.request().method() === "PUT")
        saved = r.request().postDataJSON().dds_exercise;
      return r.fulfill({ json: card });
    }
    if (path === "services")
      return r.fulfill({ json: [{ id: "service", name: "Служба 101" }] });
    if (path === "service-profiles/profile")
      return r.fulfill({ json: profile });
    if (path === "service-profiles") return r.fulfill({ json: [profile] });
    if (path.endsWith("/routes"))
      return r.fulfill({
        json: [
          { service_id: "service", service_name: "Служба 101", conditions: {} },
        ],
      });
    return r.fallback();
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, "teacher");
  await page.goto("/cards");
  await page
    .getByRole("button", {
      name: /Редактировать карточку «ДДС: передача смены»/,
    })
    .click();
  await expect(page.getByLabel("Новое сообщение для ученика")).toHaveValue(
    "Расчёт прибыл по адресу.\n\nТребуется зафиксировать прибытие.",
  );
  await page
    .getByLabel("Новое сообщение для ученика")
    .fill("Бригада сообщает о прибытии на место.");
  await page.getByLabel("Минут до поступления карточки").fill("8");
  await page
    .getByText("Работа бригад по карточке", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/dds-card-history/editor.png",
    animations: "disabled",
  });
  await page
    .getByLabel("Новое сообщение для ученика")
    .evaluate((node) =>
      node.scrollIntoView({ block: "center", behavior: "instant" }),
    );
  await page.screenshot({
    path: "docs/screenshots/dds-card-history/editor-message.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Сохранить изменения", exact: true })
    .click();
  await expect
    .poll(() => saved?.initial_crews[0].history[0].seconds_before_start)
    .toBe(480);
  expect(saved?.messages[0].message).toBe(
    "Бригада сообщает о прибытии на место.",
  );
  expect(saved?.messages).toHaveLength(1);
});
