import { test, expect } from "./auth-fixture";

test("student creates a personal lesson from a referral and reopens it", async ({
  page,
}) => {
  let created = false;
  let requests = 0;
  let fail = true;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/v1/student/messages**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("summary"))
      return route.fulfill({ json: { unread_count: 1 } });
    return route.fulfill({
      json: {
        items: [
          {
            id: "advice",
            source: "learning_advice",
            teacher_name: "",
            group_name: null,
            read_at: null,
            created_at: "2026-09-28T12:00:00Z",
            text: "Заполнение адреса: в последних 6 проверенных карточках полностью верно выполнено 2, с расхождениями — 4. Повторяются ошибки в номере дома и корпусе. Отработайте перенос адреса в отдельные поля.",
            details: {
              role: "operator_112",
              mode: "ai",
              suggestions: [
                {
                  skill: "address",
                  label: "Заполнение адреса",
                  lesson_id: null,
                  lesson_title: null,
                  referral: {
                    id: "referral",
                    expires_at: "2026-10-28T12:00:00Z",
                    status: created ? "used" : "available",
                    lesson_id: created ? "lesson" : null,
                    lesson_title: created ? "По направлению: адрес" : null,
                  },
                },
              ],
            },
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
    });
  });
  await page.route(
    "**/api/v1/student/learning-referrals/referral/lesson",
    async (route) => {
      requests++;
      expect(route.request().method()).toBe("POST");
      expect(route.request().postData()).toBeNull();
      if (fail)
        return route.fulfill({
          status: 409,
          json: {
            message: "Сценарий сейчас недоступен. Обратитесь к преподавателю.",
          },
        });
      created = true;
      return route.fulfill({ json: { lesson_id: "lesson", created: true } });
    },
  );
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill("student1");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/student$/);
  const message = page
    .getByRole("alert")
    .filter({ hasText: "Учебный помощник" });
  await expect(message).toContainText("Действует до");
  await expect(message).toContainText("одно личное занятие");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await message.screenshot({
    path: "docs/screenshots/learning-referrals/desktop.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await message.screenshot({
    path: "docs/screenshots/learning-referrals/mobile.png",
    animations: "disabled",
  });
  await message.getByRole("button", { name: /создать занятие/ }).click();
  await expect(message).toContainText("Сценарий сейчас недоступен");
  await expect(page).toHaveURL(/\/student$/);
  fail = false;
  await message.getByRole("button", { name: /создать занятие/ }).click();
  await expect(page).toHaveURL(/\/student\/sessions\/lesson$/);
  await expect(page.getByText("Учебное занятие").first()).toBeVisible();
  await page.goto("/student");
  await expect(
    message.getByRole("link", { name: /открыть занятие/ }),
  ).toHaveAttribute("href", "/student/sessions/lesson");
  await message.getByRole("link", { name: /открыть занятие/ }).click();
  await expect(page).toHaveURL(/\/student\/sessions\/lesson$/);
  expect(requests).toBe(2);
  expect(errors).toEqual([]);
});

test("expired and superseded referrals cannot offer creation", async ({
  page,
}) => {
  let obsolete = false;
  await page.route("**/api/v1/student/messages**", (route) => {
    if (new URL(route.request().url()).pathname.endsWith("summary"))
      return route.fulfill({ json: { unread_count: 0 } });
    return route.fulfill({
      json: {
        items: [
          {
            id: "expired",
            source: "learning_advice",
            text: "Повторите работу со статусами бригад",
            read_at: "2026-09-28T12:00:00Z",
            created_at: "2026-08-01T12:00:00Z",
            teacher_name: "",
            group_name: null,
            details: {
              role: "dds",
              mode: "ai",
              obsolete,
              suggestions: [
                {
                  skill: "dds_response",
                  label: "Статусы бригад",
                  lesson_id: null,
                  lesson_title: null,
                  referral: {
                    id: "old",
                    expires_at: "2026-09-01T12:00:00Z",
                    status: "expired",
                    lesson_id: null,
                    lesson_title: null,
                  },
                },
              ],
            },
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
    });
  });
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill("student1");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/student$/);
  await expect(page.getByText(/Срок направления.*истёк/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /создать занятие/ }),
  ).toHaveCount(0);
  obsolete = true;
  await page.reload();
  await expect(
    page.getByText("Оценки пересмотрены. Эта рекомендация устарела."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /создать занятие/ }),
  ).toHaveCount(0);
});
