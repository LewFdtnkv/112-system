import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";
import { defaultLearningPolicy } from "../src/entities/training/model/learning";

const policy = {
  ...defaultLearningPolicy(),
  kind: "introduction" as const,
  assistance: { max_level: "solution" as const, on_request: true },
};
async function open(page: import("@playwright/test").Page) {
  await page.route("**/api/v1/telephony/attempts/attempt", (r) =>
    r.fulfill({
      json: { enabled: false, station: null, active_call: null, calls: [] },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("Логин").fill("student1");
  await page.getByLabel("Пароль").fill("test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/student$/);
  await page.goto("/student/sessions/lesson");
  await page
    .getByRole("button", { name: "Продолжить заполнение", exact: true })
    .click();
  await expect(page.locator(".arm-card-dialog .MuiDialog-container")).toHaveCSS(
    "opacity",
    "1",
  );
}

test("guide introduces the task, waits for correct and confirmed answers, includes search results", async ({
  page,
}) => {
  const fixture = await mockBusiness(page, policy);
  const confirmed = new Set<string>();
  const issued = new Map<string, string>();
  let unavailable = false;
  await page.route(
    "**/api/v1/student/attempts/attempt/classifier-entries*",
    (r) =>
      r.fulfill({
        json: [
          {
            ...fixture.currentAttempt().classifier_entry,
            id: "entry-new",
            name: "Пожар",
          },
        ],
      }),
  );
  await page.route(
    "**/api/v1/student/attempts/attempt/hints",
    async (route) => {
      const body = route.request().postDataJSON();
      if (unavailable)
        return route.fulfill({
          status: 503,
          json: { detail: "Помощь временно недоступна" },
        });
      if (body.confirm_hint_id)
        confirmed.add(issued.get(body.confirm_hint_id)!);
      const a = fixture.currentAttempt();
      const task = !confirmed.has("guide.source")
        ? "guide.source"
        : a.card.classifier_entry_id !== "entry-new"
          ? "classifier_entry_id"
          : a.card.data.address_details.street !== "Лесная улица"
            ? "address_details.street"
            : !confirmed.has("description")
              ? "description"
              : !confirmed.has("guide.services")
                ? "guide.services"
                : "submit";
      const texts: Record<string, string> = {
        "guide.source":
          "Здесь условия задачи. Прочитайте их и нажмите «Продолжить».",
        classifier_entry_id:
          "Выберите тип происшествия. Для поиска введите хотя бы два символа.\n\nПо условию задачи правильный ответ: Пожар.",
        "address_details.street":
          "Укажите улицу.\n\nПо условию задачи правильный ответ: Лесная улица.",
        description:
          "Кратко опишите, что случилось. Можно своими словами. Допишите ответ и нажмите «Продолжить».",
        "guide.services":
          "Службы подбираются автоматически. Сейчас список подходит к задаче, менять его не нужно. Если нужно, службы можно выбрать вручную кнопкой «+».",
        submit: "Проверьте карточку и нажмите «сохранить» внизу.",
      };
      const target =
        task === "guide.source"
          ? "source"
          : task === "classifier_entry_id"
            ? "classification"
            : task === "address_details.street"
              ? "address"
              : task === "guide.services"
                ? "notification"
                : task;
      issued.set(body.request_id, task);
      await route.fulfill({
        json: {
          status: "ready",
          revision: a.card.revision,
          hint: {
            id: body.request_id,
            task,
            target,
            level: "solution",
            presentation: "highlight",
            text: texts[task],
            advance: ["guide.source", "guide.services", "description"].includes(
              task,
            )
              ? "confirm"
              : "action",
            continue_allowed: true,
          },
        },
      });
    },
  );
  await open(page);
  const panel = page.getByRole("region", { name: "Текущий шаг обучения" });
  await expect(panel).toContainText("Здесь условия задачи");
  await expect(
    panel.getByRole("button", { name: "Отключить сопровождение", exact: true }),
  ).toHaveCount(2);
  await page.screenshot({
    path: "docs/screenshots/interface-guide/task-introduction.png",
  });
  await panel.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Тип происшествия", exact: true })
    .fill("по");
  const result = page.locator(".arm-category-results");
  await expect(
    result.getByRole("button", { name: "Пожар", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const hole = await page
        .locator(".interface-guide-veil rect")
        .boundingBox();
      const list = await result.boundingBox();
      return !!hole && !!list && hole.y + hole.height >= list.y + list.height;
    })
    .toBe(true);
  await page.screenshot({
    path: "docs/screenshots/interface-guide/type-search.png",
  });
  await result.getByRole("button", { name: "Пожар", exact: true }).click();
  await expect(panel).toContainText("Лесная улица");
  await page.getByLabel("Улица", { exact: true }).fill("Лесная");
  await expect
    .poll(() => fixture.currentAttempt().card.data.address_details.street)
    .toBe("Лесная");
  await expect(panel).toContainText("Лесная улица");
  await page.screenshot({
    path: "docs/screenshots/interface-guide/operator-112.png",
  });
  await panel
    .getByRole("button", { name: "Отключить сопровождение", exact: true })
    .last()
    .click();
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "Включить сопровождение" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/interface-guide/operator-mobile.png",
  });
  await page.getByLabel("Улица", { exact: true }).fill("Лесная улица");
  await expect(panel).toContainText("Кратко опишите");
  await page
    .getByRole("textbox", { name: "Сообщение со слов заявителя" })
    .fill("Начало");
  await expect
    .poll(() => fixture.currentAttempt().card.data.description)
    .toBe("Начало");
  await expect(panel).toContainText("Кратко опишите");
  await page.reload();
  await page
    .getByRole("button", { name: "Продолжить заполнение", exact: true })
    .click();
  await expect(panel).toContainText("Кратко опишите");
  await page
    .getByRole("textbox", { name: "Сообщение со слов заявителя" })
    .fill("В доме дым из окна, очевидец находится снаружи.");
  await panel.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(panel).toContainText("менять его не нужно");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({
    path: "docs/screenshots/interface-guide/services-explanation.png",
  });
  await panel.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(panel).toContainText("Завершите карточку");
  unavailable = true;
  await panel.getByRole("button", { name: "Проверить шаг" }).click();
  await expect(panel.getByRole("alert")).toBeVisible();
  unavailable = false;
  await panel.getByRole("button", { name: "Проверить шаг" }).click();
  await expect(panel.getByRole("alert")).toHaveCount(0);
});

test("DDS guide follows own service, assignment dialog and crew pencil", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("Failed to load resource")
    )
      errors.push(message.text());
  });
  const fixture = await mockBusiness(page, policy);
  let sourceConfirmed = false;
  const time = new Date().toISOString();
  const base = fixture.currentAttempt();
  const dds = {
    workflow: "crews-v1",
    revision: 1,
    response_id: "response",
    status: "received",
    goal: "Назначить бригаду",
    sent_at: time,
    first_decision_at: null,
    allowed_statuses: [],
    can_finish: true,
    comment: "",
    crew_number: null,
    history: [],
    crew_goals: [],
    information: {
      id: "info",
      message: "Расчёт № 1 сообщил о начале реагирования.",
    },
    profile: {
      id: "profile",
      service_id: "service",
      name: "ДДС службы 101",
      version: 1,
      status: "published",
      created_at: time,
      responsibility: "Пожарная охрана",
      procedure: "Назначьте бригаду",
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
    },
    responses: [
      {
        service_id: "service",
        name: "Пожарно-спасательная служба",
        short_name: "Служба 101",
        status: "received",
        added_at: time,
        comment: "",
        crew_number: null,
      },
    ],
    crews: [] as Record<string, unknown>[],
  };
  await page.route("**/api/v1/student/attempts/attempt", (r) =>
    r.fulfill({ json: { ...base, role: "dds", dds } }),
  );
  await page.route("**/api/v1/student/attempts/attempt/hints", (r) => {
    const body = r.request().postDataJSON();
    if (body.confirm_hint_id) sourceConfirmed = true;
    if (!sourceConfirmed)
      return r.fulfill({
        json: {
          status: "ready",
          revision: dds.revision,
          hint: {
            id: body.request_id,
            task: "guide.source",
            target: "source",
            level: "solution",
            advance: "confirm",
            continue_allowed: true,
            presentation: "highlight",
            text: "Здесь условия задачи ДДС. Прочитайте их и нажмите «Продолжить».",
          },
        },
      });

    return r.fulfill({
      json: {
        status: "ready",
        revision: dds.revision,
        hint: {
          id: body.request_id,
          task: dds.crews.length
            ? "crew.fire-1.assigned"
            : "crew.fire-1.assign",
          level: "solution",
          target: dds.crews.length ? "dds_response" : "dds_crews",
          presentation: "highlight",
          text: dds.crews.length
            ? "Отразите сведения о работе бригады.\n\nОткройте карандаш бригады и подтвердите новый статус галочкой. Комментарий необязателен.\n\nСледующий статус: Реагирование."
            : "Назначьте необходимые бригады.\n\nОткройте свою службу, нажмите «Назначить бригаду» и подтвердите галочкой справа.\n\nНазначьте бригаду «Пожарный расчёт № 1».",
        },
      },
    });
  });
  await page.route("**/api/v1/student/attempts/attempt/dds/crews", (r) => {
    const body = r.request().postDataJSON();
    dds.revision++;
    dds.crews = [
      {
        id: "crew",
        crew_code: "fire-1",
        name: "Пожарный расчёт № 1",
        status: body.status,
        allowed_statuses: ["responding", "cancelled"],
        history: [],
        status_updated_at: time,
      },
    ];
    return r.fulfill({ json: { ...base, role: "dds", dds } });
  });
  await open(page);
  const panel = page.getByRole("region", { name: "Текущий шаг обучения" });
  await expect(panel).toContainText("Здесь условия задачи ДДС");
  await page.screenshot({
    path: "docs/screenshots/interface-guide/dds-task-introduction.png",
  });
  await panel.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(panel).toContainText("Нажмите плитку своей службы");
  await expect(page.locator(".arm-card-dialog .MuiDialog-container")).toHaveCSS(
    "opacity",
    "1",
  );
  await page.screenshot({
    path: "docs/screenshots/interface-guide/dds-service.png",
    animations: "disabled",
  });
  await page.locator('[data-guide-target="dds.own_service"] button').click();
  await page.getByRole("button", { name: "+ Назначить бригаду" }).click();
  await expect(panel).toContainText("Галочка сохраняет запись");
  await page
    .getByRole("combobox", { name: "Бригада", exact: true })
    .selectOption("fire-1");
  await expect(
    page.locator(".dds-status-dialog .MuiDialog-container"),
  ).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: "docs/screenshots/interface-guide/dds-editor.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Назначить бригаду", exact: true })
    .click();
  await expect(panel).toContainText("Нажмите карандаш");
  await page
    .getByRole("button", {
      name: "Изменить статус бригады «Пожарный расчёт № 1»",
    })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Статус бригады", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Статус бригады", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("teacher can assign interface introduction with full assistance", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Логин").fill("teacher");
  await page.getByLabel("Пароль").fill("test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/teacher$/);
  await page.route("**/api/v1/scenarios/scenario", (r) =>
    r.fulfill({ json: { id: "scenario", role: "operator_112" } }),
  );
  await page.goto("/training?group=group&scenario=scenario&title=Обучение");
  await page.getByRole("button", { name: /Освоение интерфейса/ }).click();
  await expect(
    page.getByRole("combobox", { name: "Максимальная помощь" }),
  ).toHaveAttribute("aria-disabled", "true");
  await expect(
    page.getByRole("combobox", { name: "Максимальная помощь" }),
  ).toHaveText("Показ эталонного решения");
  await page.locator(".learning-settings").screenshot({
    path: "docs/screenshots/interface-guide/teacher-settings.png",
  });
  await page.route("**/api/v1/lessons/start", async (r) => {
    const body = r.request().postDataJSON();
    expect(body.learning.kind).toBe("introduction");
    expect(body.learning.assistance).toEqual(policy.assistance);
    expect(body.learning.target_skills).toEqual([]);
    await r.fulfill({
      status: 201,
      json: { id: "new-lesson", learning: body.learning },
    });
  });
  await page
    .getByRole("button", { name: "Назначить задание", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Освоение интерфейса");
  await page.getByRole("button", { name: "Подтвердить назначение" }).click();
  await expect(page).toHaveURL(/training\/new-lesson$/);
});

test("journal explains where to get the next card and disabling applies inside it", async ({
  page,
}) => {
  const fixture = await mockBusiness(page, policy);
  let started = false;
  await page.route("**/api/v1/student/lessons/lesson", (r) =>
    r.fulfill({
      json: {
        id: "lesson",
        title: "Освоение интерфейса",
        learning: policy,
        status: "active",
        work_status: "in_progress",
        started_at: new Date().toISOString(),
        ended_at: null,
        assignments: [
          {
            id: "previous",
            position: 1,
            title: "Завершённая",
            role: "operator_112",
            status: "completed",
            attempt_id: "previous-attempt",
            available: false,
            card: null,
          },
          {
            id: "assignment",
            position: 2,
            title: "Следующая",
            role: "operator_112",
            status: started ? "in_progress" : "pending",
            attempt_id: started ? "attempt" : null,
            available: true,
            card: null,
          },
        ],
      },
    }),
  );
  await page.route("**/api/v1/student/assignments/assignment/start", (r) => {
    started = true;
    return r.fulfill({ json: fixture.currentAttempt() });
  });
  await page.goto("/login");
  await page.getByLabel("Логин").fill("student1");
  await page.getByLabel("Пароль").fill("test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/student$/);
  await page.goto("/student/sessions/lesson");
  const panel = page.getByRole("region", { name: "Текущий шаг обучения" });
  await expect(panel).toContainText("нажмите «+»");
  await page.screenshot({
    path: "docs/screenshots/interface-guide/journal-next-card.png",
  });
  await panel
    .getByRole("button", { name: "Отключить сопровождение", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "Создать новую карточку", exact: true })
    .click();
  await expect(page.locator(".arm-card-dialog")).toBeVisible();
  expect(started).toBe(true);
  await expect(panel).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Включить сопровождение" }),
  ).toBeVisible();
});
