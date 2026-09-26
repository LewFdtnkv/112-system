import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";

test("learner receives grounded study advice separately from in-card help", async ({
  page,
}) => {
  await mockBusiness(page);
  await page.route("**/api/v1/student/overview*", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "demo-student-1",
          username: "student1",
          first_name: "Анна",
          last_name: "Смирнова",
          middle_name: null,
          email: null,
        },
        groups: ["Учебная группа"],
        active_lessons: { items: [], total: 0, offset: 0, limit: 6 },
        performance: {
          total_lessons: 3,
          completed_lessons: 3,
          graded_lessons: 3,
          overall_percent: 83,
          recent_percent: 83,
          recent_count: 3,
          recent_limit: 5,
          recent_lessons: [],
          tracks: [
            {
              track: "training",
              graded_lessons: 3,
              overall_percent: 83,
              recent_percent: 83,
              recent_count: 3,
              recent_lessons: [],
            },
          ],
        },
      },
    }),
  );
  let read = false;
  let feedback: string | undefined;
  let unavailable = false;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/v1/student/messages**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/summary"))
      return route.fulfill({ json: { unread_count: read ? 0 : 1 } });
    if (url.pathname.endsWith("/read")) {
      read = true;
      return route.fulfill({ status: 204 });
    }
    if (url.pathname.endsWith("/feedback")) {
      if (unavailable)
        return route.fulfill({
          status: 503,
          json: { detail: "Попробуйте ещё раз" },
        });
      feedback =
        url.searchParams.get("helpful") === "true" ? "helpful" : "not_helpful";
      return route.fulfill({ status: 204 });
    }
    const items =
      url.searchParams.get("include_advice") === "false"
        ? []
        : [
            {
              id: "advice",
              source: "learning_advice",
              teacher_name: "",
              group_name: null,
              text: "В последних самостоятельных работах успешно выполнены проверенные задания по классификации происшествий.\n\nЗаполнение адреса: в последних 6 проверенных карточках полностью верно выполнено 2, с расхождениями — 4. Повторяются расхождения в полях: «Дом» (4), «Корпус» (4). Начните с короткой тренировки. Отработайте перенос известных частей адреса в отдельные поля и проверку ориентиров. После неё попробуйте полную учебную ситуацию.",
              read_at: read ? "2026-09-24T15:00:00Z" : null,
              created_at: "2026-09-24T14:00:00Z",
              details: {
                role: "operator_112",
                mode: "ai",
                feedback,
                obsolete: false,
                suggestions: [
                  {
                    skill: "address",
                    label: "Заполнение адреса",
                    lesson_id: "lesson",
                    lesson_title: "Тренировка адреса",
                  },
                ],
              },
            },
          ];
    return route.fulfill({
      json: { items, total: items.length, limit: 20, offset: 0 },
    });
  });
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill("student1");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  const message = page
    .getByRole("alert")
    .filter({ hasText: "Учебный помощник" });
  await expect(message).toContainText("расхождениями — 4");
  await expect(
    message.getByRole("link", { name: /открыть занятие/ }),
  ).toHaveAttribute("href", "/training/lesson");
  await message.scrollIntoViewIfNeeded();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "docs/screenshots/learning-recommendations/desktop.png",
    fullPage: true,
  });
  unavailable = true;
  await message.getByRole("button", { name: "Не подходит" }).click();
  await expect(message).toContainText("Повторите попытку");
  unavailable = false;
  await message.getByRole("button", { name: "Не подходит" }).click();
  await expect(message).toContainText("Отзыв сохранён");
  await message.getByRole("button", { name: "Прочитано" }).click();
  await expect(message.getByRole("button", { name: "Прочитано" })).toHaveCount(
    0,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await message.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "docs/screenshots/learning-recommendations/mobile.png",
    fullPage: true,
  });
  await page.reload();
  await expect(message).toContainText("Отзыв сохранён");
  await page.goto("/training/lesson");
  await expect(
    page.getByText("Учебный помощник · дальнейшее обучение"),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
