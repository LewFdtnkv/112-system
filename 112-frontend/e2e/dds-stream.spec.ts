import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";
import type {
  Attempt,
  StudentLesson,
} from "../src/entities/training/types/types";

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

test("DDS arrivals do not close the current card and survive page reload", async ({
  page,
}) => {
  const base = (await mockBusiness(page)).currentAttempt();
  const time = new Date(Date.now() - 35000).toISOString();
  const profile = {
    id: "profile",
    service_id: "service",
    name: "ДДС службы 101",
    responsibility: "Учебный район",
    procedure: "Назначьте бригаду и фиксируйте поступившие сведения.",
    territories: [],
    objects: [],
    contacts: [],
    crews: [
      {
        code: "crew",
        name: "Пожарная бригада № 1",
        description: "Учебный район",
        is_active: true,
        contact_code: null,
      },
    ],
  };
  function makeAttempt(n: number): Attempt {
    return {
      ...base,
      id: `attempt-${n}`,
      assignment_id: `assignment-${n}`,
      role: "dds",
      norm_seconds: 30,
      instructions:
        "Бригада сообщает: началось реагирование.\n\nЗафиксируйте сведения.\n\nЗафиксируйте сведения.",
      caller_message: null,
      card: {
        ...base.card,
        id: `card-${n}`,
        display_number: 1042 + n,
        status: "notified",
        data: {
          ...base.card.data,
          description: `Происшествие ${n}: дым из окна`,
          address_text: `Учебная улица, ${n}`,
        },
      },
      dds: {
        workflow: "crews-v1",
        profile: {
          ...profile,
          version: 1,
          status: "published",
          created_at: time,
        },
        response_id: `response-${n}`,
        revision: 1,
        status: "received",
        goal: "Обработать бригады по сведениям задания",
        sent_at: time,
        first_decision_at:
          n === 2 ? new Date(Date.parse(time) + 5000).toISOString() : null,
        reaction_norm_seconds: 30,
        crew_number: null,
        comment: "",
        allowed_statuses: [],
        can_finish: true,
        information: {
          id: `information-${n}`,
          message: "Бригада сообщает: началось реагирование.",
        },
        history: [],
        crews: [],
        responses: [
          {
            service_id: "service",
            name: "Учебная пожарно-спасательная служба района",
            short_name: "Служба 101",
            status: "received",
            added_at: time,
            status_updated_at: time,
            comment: "",
            crew_number: null,
          },
        ],
      },
    };
  }
  const attempts = [makeAttempt(1), makeAttempt(2)];
  let started = false;
  let arrivals = 1;
  const opened = new Set<number>();
  const lesson = (): StudentLesson => ({
    learning: base.learning,
    id: "lesson",
    title: "ДДС: несколько происшествий",
    status: "active",
    work_status: started ? "in_progress" : "assigned",
    started_at: time,
    ended_at: null,
    delivery: "dds-stream-v1",
    execution_started_at: started ? time : null,
    assignments: attempts.map((a, i) => ({
      id: a.assignment_id,
      position: i + 1,
      title: `Карточка ${i + 1}`,
      role: "dds",
      available: started && i < arrivals,
      status: started && i < arrivals ? "in_progress" : "pending",
      attempt_id: started && i < arrivals ? a.id : null,
      received_at: started && i < arrivals ? time : null,
      first_opened_at: opened.has(i) ? time : null,
      response_norm_seconds: 30,
      first_response_at: a.dds?.first_decision_at,
      card:
        started && i < arrivals
          ? {
              id: a.card.id,
              display_number: a.card.display_number,
              started_at: time,
              status: "notified",
              address_text: a.card.data.address_text!,
              description: a.card.data.description!,
              caller_name: null,
              caller_phone: null,
              classifier_entry_id: "entry",
              category_name: "101",
            }
          : null,
    })),
  });
  await page.route("**/api/v1/student/lessons/lesson", (r) =>
    r.fulfill({ json: lesson() }),
  );
  await page.route("**/api/v1/student/lessons/lesson/start", (r) => {
    started = true;
    return r.fulfill({ json: lesson() });
  });
  await page.route("**/api/v1/student/assignments/*/start", (r) => {
    const i =
      Number(
        r
          .request()
          .url()
          .match(/assignment-(\d)/)![1],
      ) - 1;
    opened.add(i);
    return r.fulfill({ json: attempts[i] });
  });
  await page.route("**/api/v1/student/attempts/attempt-*", (r) => {
    const i =
      Number(
        r
          .request()
          .url()
          .match(/attempt-(\d)/)![1],
      ) - 1;
    return r.fulfill({ json: attempts[i] });
  });
  await page.route("**/api/v1/telephony/attempts/*", (r) =>
    r.fulfill({ json: { enabled: false, station: null, cues: [], calls: [] } }),
  );
  await login(page);
  await page.goto("/student/sessions/lesson");
  await page.getByRole("button", { name: "Приступить к заданию" }).click();
  await page.getByRole("button", { name: "Подтвердить начало" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Продолжить обработку" }).click();
  await expect(page.locator(".arm-card-dialog")).toContainText(
    "Происшествие 1",
  );
  await expect(
    page
      .locator(".training-panel__source")
      .getByText("Бригада сообщает: началось реагирование.", { exact: true }),
  ).toHaveCount(1);
  await expect(
    page.locator(".training-panel__row").filter({ hasText: "Инструкция" }),
  ).toHaveText("ИнструкцияЗафиксируйте сведения.");
  arrivals = 2;
  await expect(
    page.locator(".arm-card-dialog .dds-arrival-status"),
  ).toContainText("Поступило: 2 из 2", {
    timeout: 10000,
  });
  await expect(page.locator(".arm-card-dialog")).toContainText(
    "Происшествие 1",
  );
  await expect(
    page.getByRole("navigation", { name: "Поступившие карточки" }),
  ).toHaveCount(0);
  await expect(page.locator(".dds-reaction-clock")).toContainText(
    "Норматив нарушен",
  );
  await page.screenshot({
    path: "docs/screenshots/dds-stream/reaction-overdue.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Закрыть карточку ДДС" }).click();
  await expect(page.locator(".dds-reaction-time")).toHaveCount(2);
  await expect(
    page.getByRole("columnheader", { name: "Реакция" }),
  ).toBeVisible();
  await page
    .getByRole("row", { name: "Карточка 1044", exact: true })
    .getByRole("cell", { name: "1044", exact: true })
    .click();
  await expect(page.locator(".arm-card-dialog")).toContainText(
    "Происшествие 2",
  );
  await expect(page.locator(".dds-reaction-clock")).toContainText("00:05");
  await expect(page.locator(".dds-reaction-clock")).not.toHaveClass(
    /is-overdue/,
  );
  await page.getByRole("button", { name: "Служба 101" }).click();
  await page.screenshot({
    path: "docs/screenshots/dds-stream/card.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".dds-reaction-clock")).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/dds-stream/card-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Закрыть карточку ДДС" }).click();
  await page.screenshot({
    path: "docs/screenshots/dds-stream/journal.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Приступить к заданию" }),
  ).toHaveCount(0);
  await expect(page.locator(".dds-arrival-status")).toContainText(
    "Поступило: 2 из 2",
  );
  await expect(
    page.getByRole("button", { name: "Получить следующую карточку" }),
  ).toHaveCount(0);
});

test("teacher edits per-card arrival intervals", async ({ page }) => {
  const profile = {
    id: "profile",
    name: "ДДС службы 101",
    responsibility: "Учебный район",
    procedure: "Назначение бригад",
    territories: [],
    objects: [],
    contacts: [],
    crews: [],
  };
  const scenario = {
    id: "scenario",
    scenario_id: "parent",
    title: "Поток карточек ДДС",
    role: "dds",
    status: "draft",
    duration_minutes: 15,
    norm_seconds: 30,
    service_profile_id: "profile",
    dds_policy: {
      workflow: "crews-v1",
      steps: [{ status: "accepted", message: "Сообщение бригады" }],
      required_crews: [],
    },
    cards: [0, 40, 130].map((offset, i) => ({
      id: `row-${i}`,
      card_template_id: `card-${i}`,
      position: i + 1,
      arrival_offset_seconds: offset,
      snapshot: {
        title: ["Пожар в доме", "ДТП", "Задымление склада"][i],
        data: {},
      },
    })),
  };
  await page.route("**/api/v1/cards/card-*", (r) =>
    r.fulfill({ json: { audio: { caller_ids: [], crew_variants: [] } } }),
  );
  await page.route("**/api/v1/scenarios/scenario", (r) =>
    r.fulfill({ json: scenario }),
  );
  await page.route("**/api/v1/service-profiles**", (r) =>
    r.fulfill({ json: [profile] }),
  );
  await page.route("**/api/v1/service-profiles/profile", (r) =>
    r.fulfill({ json: profile }),
  );
  await login(page, "teacher");
  await page.goto("/scenarios/scenario/edit");
  const delays = page.getByLabel("После предыдущей карточки, с", {
    exact: true,
  });
  await expect(delays.nth(0)).toHaveValue("40");
  await expect(delays.nth(1)).toHaveValue("90");
  await delays.nth(1).fill("120");
  await expect(
    page.getByText("Итого от начала занятия: 160 с", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/dds-stream/schedule.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Записи карточки", exact: true })
    .first()
    .click();
  const emptyRecordings = page.getByText("Свои голоса не выбраны.", {
    exact: false,
  });
  await expect(emptyRecordings).toBeVisible();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const description = (await emptyRecordings.boundingBox())!;
    const field = (await page
      .locator('[data-validation-field="arrival_offsets_seconds.0"]')
      .boundingBox())!;
    expect(field.y - description.y - description.height).toBeGreaterThanOrEqual(
      12,
    );
    await page.screenshot({
      path: `docs/screenshots/dds-stream/schedule-recordings-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
});
