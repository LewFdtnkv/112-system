import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";
import { defaultLearningPolicy } from "../src/entities/training/model/learning";
import type { TelephoneState } from "../src/entities/telephony";

const browserName = process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH
  ? "firefox"
  : "chromium";
test.use({
  browserName,
  launchOptions: {
    executablePath:
      browserName === "firefox"
        ? process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH
        : process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  },
});

test("training panel groups the task and controls without nested incident scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const fixture = await mockBusiness(page, {
    ...defaultLearningPolicy(),
    assistance: { max_level: "explanation", on_request: true },
  });
  const attempt = fixture.currentAttempt();
  const features = Array.from({ length: 12 }, (_, i) => ({
    key: `feature_${i}`,
    label: `Признак происшествия ${i + 1}`,
    type: "boolean",
    required: false,
  }));
  await page.route("**/api/v1/student/attempts/attempt", (r) =>
    r.fulfill({
      json: {
        ...attempt,
        classifier_entry: {
          ...attempt.classifier_entry,
          conditions: { format: "typed-features-v1", features },
        },
      },
    }),
  );
  await page.route(
    "**/api/v1/student/attempts/attempt/recipients-preview",
    (r) => r.fulfill({ json: attempt.recipient_services }),
  );
  const state: TelephoneState = {
    enabled: true,
    station: {
      id: "station",
      name: "Asterisk demo",
      mode: "phone",
      provider: "asterisk",
      endpoint: "1001",
      student_id: "demo-student-1",
      attempt_id: "attempt",
      enabled: true,
      provisioned: true,
      error: null,
    },
    cues: [
      {
        id: "cue",
        name: "Руководитель аварийно-спасательной бригады Центрального административного округа",
        contact_key: "crew",
        status: "ready",
        duration_seconds: 10,
      },
    ],
    calls: [],
    active_call: null,
  };
  state.cues.push({
    ...state.cues[0],
    id: "cue-2",
    name: "Дежурный диспетчер",
  });
  await page.route("**/api/v1/telephony/attempts/attempt", (r) =>
    r.fulfill({ json: state }),
  );
  let command: unknown;
  await page.route("**/api/v1/telephony/attempts/attempt/calls", (r) => {
    command = r.request().postDataJSON();
    state.active_call = {
      id: "call",
      attempt_id: "attempt",
      station_id: "station",
      command_id: "command",
      contact_name:
        "Руководитель аварийно-спасательной бригады Центрального административного округа",
      endpoint_key: "crew",
      status: "dialing",
      direction: "outgoing",
      transport: "manual",
      started_at: new Date().toISOString(),
      connected_at: null,
      ended_at: null,
      result: null,
      cancel_requested: false,
      provider_confirmed: true,
    };
    return r.fulfill({ json: state.active_call });
  });
  await page.route(
    "**/api/v1/telephony/attempts/attempt/calls/call/cancel",
    (r) => {
      const call = { ...state.active_call, status: "cancelled" };
      state.active_call = null;
      return r.fulfill({ json: call });
    },
  );
  await page.goto("/login");
  await page.getByLabel("Логин").fill("student1");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
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
  const panel = page.getByRole("region", {
    name: "Учебное задание",
    exact: true,
  });
  await expect(panel).toContainText(attempt.caller_message);
  await expect(panel).toContainText(attempt.instructions);
  await expect(
    panel.getByRole("region", { name: "Учебный телефон" }),
  ).toBeVisible();
  await expect(panel).not.toContainText(/Asterisk|АТС|SIP|Готова/);
  const sections = await panel.evaluate((el) =>
    Array.from(el.children).map((child) => child.className),
  );
  expect(sections[0]).toBe("training-panel__source");
  expect(sections[1]).toBe("training-telephone");
  expect(sections[2]).toBe("learning-help");
  const questionnaire = page.locator(".arm-questionnaire");
  await expect(questionnaire).toHaveCSS("overflow-y", "visible");
  expect(
    await questionnaire.evaluate(
      (el) => el.scrollHeight <= el.clientHeight + 1,
    ),
  ).toBe(true);
  const checkFooter = async () => {
    const footer = await page.locator(".arm-card-footer").boundingBox();
    expect(
      Math.abs(footer!.y + footer!.height - page.viewportSize()!.height),
    ).toBeLessThanOrEqual(1);
    expect(
      await page
        .locator(".arm-card-dialog .MuiDialog-paper")
        .evaluate((el) => el.scrollTop),
    ).toBe(0);
  };
  for (const label of ["АОН", "Предоставленный", "Телефон на месте"]) {
    await page.getByLabel(label, { exact: true }).fill("+79991234567");
  }
  const checkPhoneWidths = async () => {
    for (const label of ["АОН", "Предоставленный", "Телефон на месте"]) {
      const fits = await page
        .getByLabel(label, { exact: true })
        .evaluate((el) => {
          const input = el as HTMLInputElement;
          const style = getComputedStyle(input);
          const context = document.createElement("canvas").getContext("2d")!;
          context.font = `${style.fontSize} ${style.fontFamily}`;
          return (
            context.measureText(input.value).width <=
            input.clientWidth -
              parseFloat(style.paddingLeft) -
              parseFloat(style.paddingRight) +
              1
          );
        });
      expect(fits, `${label}: all digits should fit`).toBe(true);
    }
  };
  await checkPhoneWidths();
  await checkFooter();
  await page.screenshot({
    path: `docs/screenshots/training-panel/${browserName}-desktop.png`,
    animations: "disabled",
  });
  await panel.getByRole("combobox", { name: "Кому позвонить" }).click();
  await page
    .getByRole("option", { name: "Дежурный диспетчер", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Выбрать контакт", exact: true })
    .click();
  await expect(panel).toContainText("Наберите 9000");
  expect(command).toMatchObject({
    cue_id: "cue-2",
    direction: "outgoing",
    transport: "manual",
  });
  await panel.getByRole("button", { name: "Завершить звонок" }).click();
  await expect(
    panel.getByRole("button", { name: "Выбрать контакт", exact: true }),
  ).toBeVisible();
  const last = page.getByRole("button", {
    name: "Признак происшествия 12: Да",
    exact: true,
  });
  await last.click();
  await expect(last).toHaveAttribute("aria-pressed", "true");
  await checkFooter();
  await page.screenshot({
    path: `docs/screenshots/training-panel/${browserName}-features.png`,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.scrollIntoViewIfNeeded();
  await checkPhoneWidths();
  await checkFooter();
  const body = page.locator(".arm-card-body");
  expect(
    await body.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await page.screenshot({
    path: `docs/screenshots/training-panel/${browserName}-mobile.png`,
    animations: "disabled",
  });
});
