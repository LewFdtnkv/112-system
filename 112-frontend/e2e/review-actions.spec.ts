import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";
import { defaultLearningPolicy } from "../src/entities/training/model/learning";

test("an open grade draft keeps its original revision during background refresh", async ({
  page,
}) => {
  await mockBusiness(page);
  let revision = 1;
  let loadedRevision = 0;
  await page.route(
    "**/api/v1/lessons/review/students/student/work",
    (route) => {
      loadedRevision = revision;
      return route.fulfill({
        json: {
          lesson_id: "review",
          student_id: "student",
          learning: defaultLearningPolicy(),
          submitted: true,
          assignments: [],
          evaluations: [
            {
              id: String(revision),
              revision,
              method: "rules",
              score: "60",
              max_score: "100",
              comment: "Оценка",
              created_at: "2026-09-27T10:00:00Z",
            },
          ],
          automatic_check: { fields: [] },
        },
      });
    },
  );
  await page.route(
    "**/api/v1/lessons/review/students/student/evaluations",
    (route) => {
      expect(route.request().postDataJSON().expected_revision).toBe(1);
      return route.fulfill({
        status: 409,
        json: { detail: "Оценка уже изменена. Загрузите актуальную оценку." },
      });
    },
  );
  await page.goto("/login");
  await page.getByLabel("Логин").fill("teacher");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/teacher$/);
  await page.goto("/results/review?student=student");
  await page.getByRole("button", { name: "Пересмотреть оценку" }).click();
  await page
    .getByLabel("Комментарий преподавателя")
    .fill("Проверил неоднозначное условие.");
  revision = 2;
  await expect.poll(() => loadedRevision, { timeout: 10000 }).toBe(2);
  await expect(page.getByLabel("Комментарий преподавателя")).toHaveValue(
    "Проверил неоднозначное условие.",
  );
  await page.getByRole("button", { name: "Сохранить оценку" }).click();
  await expect(
    page.getByRole("dialog").getByText(/Данные изменились/),
  ).toBeVisible();
});

test("teacher reviews a grade, sees history and writes to the student", async ({
  page,
}) => {
  await mockBusiness(page);
  const grades = [
    {
      id: "automatic",
      method: "hybrid",
      score: "60.00",
      max_score: "100.00",
      revision: 1,
      created_at: "2026-09-27T10:00:00Z",
      comment: "Требуется проверка формулировки.",
    },
  ];
  let publications = 0;
  await page.route("**/assessment-memory", (route) => {
    if (route.request().method() === "POST") publications++;
    return route.fulfill({ json: [] });
  });
  await page.route("**/api/v1/lessons/review/students/student/work", (route) =>
    route.fulfill({
      json: {
        lesson_id: "review",
        student_id: "student",
        learning: defaultLearningPolicy(),
        submitted: true,
        assignments: [],
        evaluations: grades,
        automatic_check: { fields: [] },
      },
    }),
  );
  await page.route(
    "**/api/v1/lessons/review/students/student/evaluations",
    (route) => {
      const body = route.request().postDataJSON();
      expect(body.expected_revision).toBe(1);
      expect(body.comment).toBe("Краткое описание передаёт смысл. Зачесть.");
      grades.push({
        id: "teacher",
        method: "teacher",
        score: String(body.score),
        max_score: "100.00",
        revision: 2,
        comment: body.comment,
        created_at: "2026-09-27T10:10:00Z",
      });
      return route.fulfill({ json: grades.at(-1) });
    },
  );
  await page.route("**/api/v1/users/student", (route) =>
    route.fulfill({
      json: {
        id: "student",
        first_name: "Анна",
        last_name: "Иванова",
        username: "student",
      },
    }),
  );
  await page.route("**/api/v1/messages", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      text: "Повторите работу с неопределёнными сведениями.",
      student_id: "student",
    });
    return route.fulfill({ json: { recipient_count: 1 } });
  });
  await page.goto("/login");
  await page.getByLabel("Логин").fill("teacher");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/teacher$/);
  await page.goto("/results/review?student=student");
  const actions = page.getByRole("group", { name: "Действия с результатом" });
  await actions.getByRole("button", { name: "Пересмотреть оценку" }).click();
  await expect(page.getByLabel("Комментарий преподавателя")).toHaveValue("");
  await page.getByRole("spinbutton", { name: "Балл", exact: true }).fill("85");
  await page
    .getByLabel("Комментарий преподавателя")
    .fill("Краткое описание передаёт смысл. Зачесть.");
  await page.screenshot({
    path: "docs/screenshots/teacher-review/grade-dialog.png",
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Сохранить оценку" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/Пересмотрено преподавателем: 60/)).toBeVisible();
  expect(publications).toBe(0);
  await page.screenshot({
    path: "docs/screenshots/teacher-review/result-desktop.png",
    animations: "disabled",
  });
  await actions.getByRole("button", { name: "История оценок (2)" }).click();
  const history = page.getByRole("dialog", { name: "История оценок" });
  await expect(
    history.getByText("Требуется проверка формулировки."),
  ).toBeVisible();
  await expect(
    history.getByText("Краткое описание передаёт смысл. Зачесть."),
  ).toBeVisible();
  await history.getByRole("button", { name: "Закрыть" }).click();
  await actions.getByRole("button", { name: "Написать ученику" }).click();
  await expect(page.getByText("Кому: Иванова Анна")).toBeVisible();
  await page
    .getByLabel("Комментарий ученику")
    .fill("Повторите работу с неопределёнными сведениями.");
  await page.getByRole("button", { name: "Отправить комментарий" }).click();
  await expect(page.getByText("Отправлено. Получателей: 1")).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/teacher-review/message.png",
    animations: "disabled",
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Закрыть" })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/teacher-review/result-mobile.png",
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("global teacher message action selects a group and clears the previous recipient", async ({
  page,
}) => {
  await mockBusiness(page);
  await page.route("**/api/v1/views/groups*", (route) =>
    route.fulfill({
      json: { items: [{ id: "group", name: "Учебная группа" }], total: 1 },
    }),
  );
  await page.route("**/api/v1/views/users*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "student",
            username: "student",
            first_name: "Анна",
            last_name: "Иванова",
          },
        ],
        total: 1,
      },
    }),
  );
  await page.route("**/api/v1/messages", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      text: "Разберите неопределённость в условии.",
      group_id: "group",
    });
    return route.fulfill({ json: { recipient_count: 3 } });
  });
  await page.goto("/login");
  await page.getByLabel("Логин").fill("teacher");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/teacher$/);
  await page.getByRole("button", { name: "Написать", exact: true }).click();
  await page.getByRole("combobox", { name: "Ученик" }).click();
  await page.getByRole("option", { name: "Иванова Анна" }).click();
  await page.getByLabel("Комментарий ученику").fill("Не должно уйти группе.");
  await page.getByRole("button", { name: "Группе", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Отправить комментарий" }),
  ).toHaveCount(0);
  await page.getByRole("combobox", { name: "Группа" }).click();
  await page.getByRole("option", { name: "Учебная группа" }).click();
  await expect(page.getByLabel("Объявление для группы")).toHaveValue("");
  await page
    .getByLabel("Объявление для группы")
    .fill("Разберите неопределённость в условии.");
  await page.getByRole("button", { name: "Отправить комментарий" }).click();
  await expect(page.getByText("Отправлено. Получателей: 3")).toBeVisible();
});
