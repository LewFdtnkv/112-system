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

test("interface guide follows saved fields, pauses, resumes and survives reload", async ({
  page,
}) => {
  const fixture = await mockBusiness(page, policy);
  let unavailable = false;
  await page.route(
    "**/api/v1/student/attempts/attempt/hints",
    async (route) => {
      const body = route.request().postDataJSON();
      expect(body.trigger).toBe("guided");
      if (unavailable)
        return route.fulfill({
          status: 503,
          json: { detail: "Учебная помощь временно недоступна" },
        });
      const a = fixture.currentAttempt();
      const phoneDone =
        a.card.data.caller_phone.replace(/\D/g, "") === "79001234567";
      const done = a.card.data.address_details.street === "Лесная улица";
      await route.fulfill({
        json: {
          status: "ready",
          revision: a.card.revision,
          hint: {
            id: body.request_id,
            task: !phoneDone
              ? "caller_phone"
              : done
                ? "submit"
                : "address_details.street",
            level: "solution",
            target: !phoneDone ? "caller" : done ? "submit" : "address",
            presentation: "highlight",
            text: !phoneDone
              ? "Введите предоставленный заявителем телефон: +7 900 123-45-67."
              : done
                ? "Проверьте карточку.\n\nНажмите «сохранить» после проверки карточки."
                : "Уточните место происшествия: по карточке должно быть понятно, куда направить помощь.\n\nЗаполняйте адрес по отдельным полям слева. Если номера дома нет, используйте описательный адрес и ориентиры, не придумывайте номер.\n\nДля «Улица» в эталонном решении указано: Лесная улица.",
          },
        },
      });
    },
  );
  await open(page);
  const panel = page.getByRole("region", { name: "Текущий шаг обучения" });
  await expect(panel).toContainText("предоставленный заявителем телефон");
  await page
    .getByLabel("Предоставленный", { exact: true })
    .fill("+79001234567");
  await expect(panel).toContainText("Лесная улица");
  await page.screenshot({
    path: "docs/screenshots/interface-guide/operator-112.png",
  });
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "Продолжить сопровождение" }).click();
  await expect(panel).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toBeVisible();
  const rect = await panel.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "docs/screenshots/interface-guide/operator-mobile.png",
  });
  await page.getByLabel("Улица", { exact: true }).fill("Лесная улица");
  await expect(panel).toContainText("Завершите карточку");
  await page.reload();
  await page
    .getByRole("button", { name: "Продолжить заполнение", exact: true })
    .click();
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
