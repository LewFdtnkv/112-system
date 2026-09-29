import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";

for (const width of [1440, 390]) {
  test(`DDS submission confirms, reports failures and can retry at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    // Firefox may suppress native dialogs after switching to an external phone.
    await page.addInitScript(() => {
      window.confirm = () => false;
    });
    const base = (await mockBusiness(page)).currentAttempt();
    const now = new Date().toISOString();
    let completed = false;
    let submits = 0;
    const read = () => ({
      ...base,
      role: "dds",
      status: completed ? "completed" : "in_progress",
      ended_at: completed ? now : null,
      dds: {
        workflow: "crews-v1",
        revision: 2,
        response_id: "response",
        status: "received",
        goal: "Оповестить бригаду",
        sent_at: now,
        first_decision_at: now,
        allowed_statuses: [],
        can_finish: !completed,
        comment: "",
        crew_number: null,
        history: [],
        crews: [],
        crew_goals: [],
        information: {
          id: "info",
          message: "Руководитель бригады подтвердил получение задачи.",
        },
        profile: {
          id: "profile",
          service_id: "service",
          name: "Служба 101",
          version: 1,
          status: "published",
          responsibility: "Пожарная охрана",
          procedure: "Передайте сведения бригаде.",
          territories: [],
          objects: [],
          contacts: [],
          crews: [],
        },
        responses: [
          {
            service_id: "service",
            name: "Пожарная охрана",
            short_name: "101",
            status: "received",
            added_at: now,
            comment: "",
            crew_number: null,
          },
        ],
      },
    });
    await page.route("**/api/v1/student/attempts/attempt", (r) =>
      r.fulfill({ json: read() }),
    );
    await page.route("**/api/v1/telephony/attempts/attempt", (r) =>
      r.fulfill({
        json: { enabled: false, station: null, calls: [] },
      }),
    );
    await page.route("**/api/v1/student/attempts/attempt/dds/submit", (r) => {
      submits++;
      expect(r.request().postDataJSON()).toEqual({ revision: 2 });
      if (submits === 1)
        return r.fulfill({
          status: 409,
          json: { message: "Сначала завершите текущий звонок." },
        });
      completed = true;
      return r.fulfill({ json: read() });
    });
    await page.goto("/login");
    await page.getByLabel("Логин").fill("student1");
    await page.getByLabel("Пароль", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page).toHaveURL(/student$/);
    await page.goto("/student/sessions/lesson");
    await page
      .getByRole("button", { name: "Продолжить заполнение", exact: true })
      .click();
    const button = page.getByRole("button", {
      name: "Завершить упражнение",
      exact: true,
    });
    const dialog = page.getByRole("dialog", {
      name: "Завершить упражнение?",
      exact: true,
    });
    await button.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(submits).toBe(0);
    await button.click();
    await dialog
      .getByRole("button", { name: "Завершить", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Сначала завершите текущий звонок.",
    );
    await page.screenshot({
      path: `docs/screenshots/dds-submit/${info.project.name || info.config.projects[0].use.browserName}-${width}-error.png`,
      animations: "disabled",
    });
    await dialog
      .getByRole("button", { name: "Завершить", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator(".dds-footer").getByRole("status")).toHaveText(
      "Упражнение завершено",
    );
    await expect(button).toHaveCount(0);
    expect(submits).toBe(2);
    await page.screenshot({
      path: `docs/screenshots/dds-submit/${info.project.name || info.config.projects[0].use.browserName}-${width}-completed.png`,
      animations: "disabled",
    });
  });
}
