import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";

test("incoming caller ID is in the ARM header and clarifications form a separate paragraph", async ({
  page,
}, info) => {
  const fixture = await mockBusiness(page);
  const attempt = fixture.currentAttempt();
  attempt.classifier_entry.name = "103";
  attempt.recipient_services[0].name = "Скорая медицинская помощь";
  attempt.caller_message =
    "Я упала и не могу подняться, мне больно. Помогите, пожалуйста. Это Москва, Лесная улица, д. 12. Меня зовут Анна Иванова.\n\nВ ходе уточнения выяснено:\nВозраст заявителя — 34 года. Место происшествия — двор.";
  Object.assign(attempt.card.data, {
    caller_name: null,
    caller_phone: null,
    caller_details: { callerId: "+7 (000) 000-12-34" },
    description: null,
    address_text: null,
    address_details: {},
  });
  await page.route("**/api/v1/telephony/attempts/attempt", (r) =>
    r.fulfill({ json: { enabled: false, station: null, calls: [] } }),
  );
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill("student1");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
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
  const aon = page.getByLabel("АОН", { exact: true });
  await expect
    .poll(async () => (await aon.inputValue()).replace(/\D/g, ""))
    .toBe("70000001234");
  await expect(page.getByLabel("Предоставленный", { exact: true })).toHaveValue(
    "",
  );
  const condition = page.locator(".training-panel__row > div").first();
  await expect(condition).toContainText("В ходе уточнения выяснено:");
  await expect(condition).toHaveCSS("white-space", "pre-wrap");
  await expect(condition).not.toContainText("000-12-34");
  await expect(condition).not.toContainText("Заявитель: женщина");
  await page.screenshot({
    path: info.outputPath("arm.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: info.outputPath("arm-mobile.png"),
    animations: "disabled",
  });
});
