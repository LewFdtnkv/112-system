import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";
import { defaultLearningPolicy } from "../src/entities/training/model/learning";

for (const initialTask of [
  "address_details.country",
  "address_text",
  "guide.address",
]) {
  test(`address guide keeps street and house accessible from ${initialTask}`, async ({
    page,
  }) => {
    const fixture = await mockBusiness(page, {
      ...defaultLearningPolicy(),
      kind: "introduction",
      assistance: { max_level: "solution", on_request: true },
    });
    fixture.currentAttempt().caller_message =
      "Россия, Москва, Лесная улица, дом 12. Из окна идёт дым.";
    fixture.currentAttempt().card.data.address_text = "";
    Object.assign(fixture.currentAttempt().card.data.address_details, {
      country: "",
      street: "",
      house: "",
      description: "",
    });
    await page.route("**/api/v1/telephony/attempts/attempt", (route) =>
      route.fulfill({
        json: { enabled: false, station: null, active_call: null, calls: [] },
      }),
    );
    await page.route("**/api/v1/student/attempts/attempt/hints", (route) => {
      const attempt = fixture.currentAttempt();
      const address = attempt.card.data.address_details;
      const complete =
        address.country === "Россия" &&
        address.street === "Лесная улица" &&
        address.house === "12";
      return route.fulfill({
        json: {
          status: "ready",
          revision: attempt.card.revision,
          hint: {
            id: route.request().postDataJSON().request_id,
            task: complete ? "description" : initialTask,
            target: complete ? "description" : "address",
            text: complete
              ? "Опишите происшествие своими словами."
              : "Заполните адрес по условию задачи в отдельных полях: страна, улица, дом.",
            level: "solution",
            presentation: "highlight",
            advance: "action",
            continue_allowed: false,
          },
        },
      });
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/login");
    await page.getByLabel("Логин").fill("student1");
    await page.getByLabel("Пароль", { exact: true }).fill("password");
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page).toHaveURL(/student$/);
    await page.goto("/student/sessions/lesson");
    await page
      .getByRole("button", { name: "Продолжить заполнение", exact: true })
      .click();
    const panel = page.getByRole("region", { name: "Текущий шаг обучения" });
    await expect(panel).toContainText("Заполните адрес");
    for (const label of ["Страна", "Улица", "Дом/Вл"]) {
      const field = page.getByRole("textbox", { name: label, exact: true });
      await expect(field).toBeVisible();
      await expect
        .poll(async () => {
          const hole = await page
            .locator(".interface-guide-veil rect")
            .boundingBox();
          const input = await field.boundingBox();
          const tooltip = await panel.boundingBox();
          return (
            !!hole &&
            !!input &&
            !!tooltip &&
            hole.x <= input.x &&
            hole.y <= input.y &&
            hole.x + hole.width >= input.x + input.width &&
            hole.y + hole.height >= input.y + input.height &&
            (tooltip.x >= input.x + input.width ||
              tooltip.x + tooltip.width <= input.x ||
              tooltip.y >= input.y + input.height ||
              tooltip.y + tooltip.height <= input.y)
          );
        })
        .toBe(true);
      // Unlike fill(), a real click checks that the guidance panel does not intercept the field.
      await field.click();
    }
    if (initialTask === "address_details.country") {
      await page.screenshot({
        path: `docs/screenshots/guide-address/${process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH ? "firefox" : "chromium"}-address.png`,
        animations: "disabled",
      });
    }
    await page.getByLabel("Страна", { exact: true }).fill("Россия");
    await page.getByLabel("Улица", { exact: true }).fill("Лесная улица");
    await expect
      .poll(() => fixture.currentAttempt().card.data.address_details.street)
      .toBe("Лесная улица");
    await expect(panel).toContainText("Заполните адрес");
    await page.getByLabel("Дом/Вл", { exact: true }).fill("12");
    await expect(panel).toContainText("Опишите происшествие");
  });
}
