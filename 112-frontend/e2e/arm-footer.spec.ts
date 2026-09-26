import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";
import { defaultLearningPolicy } from "../src/entities/training/model/learning";

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
for (const role of ["operator_112", "dds"] as const) {
  test(`guided ${role} footer remains at the viewport bottom`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    const fixture = await mockBusiness(page, {
      ...defaultLearningPolicy(),
      kind: "introduction",
      assistance: { max_level: "solution", on_request: true },
    });
    if (role === "dds") {
      const base = fixture.currentAttempt();
      const time = new Date().toISOString();
      await page.route("**/api/v1/student/attempts/attempt", (r) =>
        r.fulfill({
          json: {
            ...base,
            role,
            dds: {
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
              crews: [],
              information: {
                id: "info",
                message: "Назначьте бригаду для проверки сообщения.",
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
                crews: [],
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
            },
          },
        }),
      );
    }
    await page.route("**/api/v1/student/attempts/attempt/hints", (r) =>
      r.fulfill({
        json: {
          status: "ready",
          revision: 1,
          hint: {
            id: "hint",
            task: role === "operator_112" ? "description" : "guide.source",
            target: role === "operator_112" ? "description" : "source",
            level: "solution",
            presentation: "highlight",
            text:
              role === "operator_112"
                ? "Кратко опишите, что случилось. Допишите ответ и нажмите «Продолжить»."
                : "Здесь условия задачи. Прочитайте их и нажмите «Продолжить».",
            advance: "confirm",
            continue_allowed: true,
          },
        },
      }),
    );
    await page.route("**/api/v1/telephony/attempts/attempt", (r) =>
      r.fulfill({
        json: { enabled: false, station: null, active_call: null, calls: [] },
      }),
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
    await expect(
      page.locator(".arm-card-dialog .MuiDialog-container"),
    ).toHaveCSS("opacity", "1");
    await expect(
      page.getByRole("region", { name: "Текущий шаг обучения" }),
    ).toBeVisible();
    const paper = page.locator(".arm-card-dialog .MuiDialog-paper");
    const measure = async (label: string) => {
      const metrics = await paper.evaluate((p) => {
        const rect = (s: string) =>
          p.querySelector(s)!.getBoundingClientRect().toJSON();
        return {
          paper: p.getBoundingClientRect().toJSON(),
          footer: rect(".arm-card-footer"),
          body: rect(".arm-card-body"),
          scrollTop: p.scrollTop,
          scrollHeight: p.scrollHeight,
        };
      });

      await page.screenshot({
        path: `docs/screenshots/arm-footer/${browserName}-${role}-${label}.png`,
        animations: "disabled",
      });
      expect(
        Math.abs(metrics.footer.bottom - page.viewportSize()!.height),
      ).toBeLessThanOrEqual(1);
      expect(metrics.body.bottom).toBeLessThanOrEqual(metrics.footer.top + 1);
      expect(metrics.scrollTop).toBe(0);
    };
    await measure("opened");
    await page
      .getByRole("button", { name: "Отключить сопровождение", exact: true })
      .last()
      .click();
    for (const viewport of [
      { width: 1366, height: 768 },
      { width: 1280, height: 600 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      if (role === "operator_112") {
        const description = page.getByLabel("Сообщение со слов заявителя", {
          exact: true,
        });
        await description.blur();
        await description.scrollIntoViewIfNeeded();
        await description.focus();
        await expect(description).toBeInViewport();
        const field = await description.boundingBox();
        const footer = await page.locator(".arm-card-footer").boundingBox();
        expect(field!.y + field!.height).toBeLessThanOrEqual(footer!.y + 1);
      }
      await measure(`focused-${viewport.width}`);
    }
  });
}
