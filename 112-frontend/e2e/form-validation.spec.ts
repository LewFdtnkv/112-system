import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";
import { defaultLearningPolicy } from "../src/entities/training/model/learning";

for (const mobile of [false, true]) {
  test(`user form highlights local and server errors ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.route("**/api/v1/users/me", (route) =>
      route.fulfill({
        json: {
          id: "admin",
          username: "admin",
          first_name: "Администратор",
          last_name: "",
          role: "admin",
          is_active: true,
          is_admin: true,
          is_teacher: false,
          must_change_password: false,
        },
      }),
    );
    let creates = 0;
    await page.route("**/api/v1/users", (route) => {
      creates++;
      return route.fulfill({
        status: 422,
        json: {
          detail: [
            {
              loc: ["body", "email"],
              type: "value_error",
              msg: "invalid email",
            },
          ],
        },
      });
    });
    await page.goto("/login");
    await page.getByLabel("Логин").fill("admin");
    await page.getByLabel("Пароль", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page).toHaveURL(/admin$/);
    await page.goto("/users");
    await page.getByRole("button", { name: "Создать пользователя" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Создать аккаунт" }).click();
    await expect(dialog.getByLabel("Логин", { exact: false })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(dialog.getByLabel("Логин", { exact: false })).toBeFocused();
    await expect(dialog.getByRole("alert")).toContainText("Стартовый пароль");
    expect(creates).toBe(0);
    await page.screenshot({
      path: info.outputPath("required-fields.png"),
      animations: "disabled",
    });
    await dialog.getByLabel("Логин", { exact: false }).fill("new-student");
    await dialog
      .getByLabel("Стартовый пароль", { exact: false })
      .fill("new-student-123");
    await dialog
      .getByLabel("Email (необязательно)", { exact: true })
      .fill("name@example.ru");
    await dialog.getByRole("button", { name: "Создать аккаунт" }).click();
    await expect(
      dialog.getByLabel("Email (необязательно)", { exact: true }),
    ).toHaveAttribute("aria-invalid", "true");
    await expect(
      dialog.getByLabel("Email (необязательно)", { exact: true }),
    ).toBeFocused();
    expect(creates).toBe(1);
    await page.screenshot({
      path: info.outputPath("server-field.png"),
      animations: "disabled",
    });
    await dialog
      .getByLabel("Email (необязательно)", { exact: true })
      .fill("other@example.ru");
    await expect(dialog.getByRole("alert")).toHaveCount(0);
  });
}

test("ARM preserves drafts and highlights missing fields without revealing answers", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await mockBusiness(page, { ...defaultLearningPolicy(), kind: "assessment" });
  await page.route("**/api/v1/telephony/attempts/attempt", (route) =>
    route.fulfill({
      json: { enabled: false, station: null, cues: [], calls: [] },
    }),
  );
  let submissions = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/attempts/attempt/submit")) submissions++;
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
  await page
    .getByRole("button", { name: "Очистить адрес", exact: true })
    .click();
  await page
    .getByLabel("Сообщение со слов заявителя", { exact: true })
    .fill("");
  await page
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  await expect(page.locator(".form-validation-summary")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Оповестить и сохранить карточку" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Оповестить и сохранить карточку" })
    .click();
  const summary = page.locator(".form-validation-summary");
  await expect(summary).toContainText("адрес происшествия");
  await expect(summary).toContainText("сообщение со слов заявителя");
  await expect(summary).not.toContainText("Учебная");
  await expect(
    page.getByLabel("Сообщение со слов заявителя", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  expect(submissions).toBe(0);
  await page.screenshot({
    path: info.outputPath("arm-required.png"),
    animations: "disabled",
  });
  await page.getByLabel("Улица", { exact: true }).fill("Другая улица");
  await expect(page.getByLabel("Улица", { exact: true })).toBeFocused();
  await expect(summary).not.toContainText("адрес происшествия");
  await page
    .getByLabel("Сообщение со слов заявителя", { exact: true })
    .fill("Сообщение");
  await expect(summary).toHaveCount(0);
});

test("scenario submit explains missing title and cards", async ({
  page,
}, info) => {
  await page.goto("/login");
  await page.getByLabel("Логин").fill("teacher");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/teacher$/);
  await page.goto("/scenarios/new");
  await page.getByRole("button", { name: "Сохранить сценарий" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Проверьте выделенные поля" }),
  ).toContainText("Добавьте хотя бы одну карточку");
  await page.screenshot({
    path: info.outputPath("scenario-required.png"),
    animations: "disabled",
  });
});

test("teacher card form separates roles and explains required values", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.route("**/api/v1/classifiers?*", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/login");
  await page.getByLabel("Логин").fill("teacher");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/teacher$/);
  await page.goto("/cards");
  await page
    .getByRole("button", { name: "Создать карточку", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Сохранить карточку", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByLabel("Название карточки", { exact: false }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(
    dialog.getByLabel("Название карточки", { exact: false }),
  ).toBeFocused();
  await expect(dialog.locator(".form-validation-summary")).toContainText(
    "Опубликованная версия ЕКП",
  );
  await expect(
    dialog.getByRole("navigation", { name: "Разделы карточки" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("region", { name: "Оператор 112 — условие", exact: true }),
  ).toContainText("Оператору ДДС это условие не показывается");
  await expect(
    dialog
      .getByRole("region", { name: "Общие данные карточки", exact: true })
      .getByLabel("Название карточки"),
  ).toBeFocused();
  await page.screenshot({
    path: info.outputPath("teacher-card-required.png"),
    animations: "disabled",
  });
});
