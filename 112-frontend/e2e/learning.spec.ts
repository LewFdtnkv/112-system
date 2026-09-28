import { test, expect } from "./auth-fixture";
import { defaultLearningPolicy } from "../src/entities/training/model/learning";

const learning = {
  ...defaultLearningPolicy(),
  kind: "skill_practice" as const,
  objective: "Указать адрес без пропусков и выбрать службы для оповещения.",
  target_skills: ["address", "notification"],
  assistance: {
    max_level: "explanation",
    on_request: true,
  },
};
const row = {
  lesson_id: "lesson",
  title: "Адрес и оповещение",
  student_id: "demo-student-1",
  student_name: "Анна Смирнова",
  scenario_version_id: "scenario",
  scenario_title: "Пожар в жилом доме",
  group_name: "Группа 1",
  role: "operator_112",
  started_at: "2026-09-22T10:00:00Z",
  completed_at: "2026-09-22T10:05:00Z",
  work_status: "submitted",
  status: "finished",
  card_count: 3,
  completed_count: 3,
  score: "80",
  max_score: "100",
  evaluation_method: "rules",
  learning,
};
const result = {
  correctness: {
    status: "available",
    value: 80,
    unit: "percent",
    explanation:
      "Проверенные формальные критерии; смысловая проверка пока не выполняется.",
  },
  independence: {
    status: "not_measured",
    value: null,
    unit: "percent",
    explanation: "Самостоятельность пока не оценивалась.",
  },
  interface: {
    status: "not_measured",
    value: null,
    unit: "percent",
    explanation: "Владение интерфейсом пока не оценивалось.",
  },
  duration: {
    status: "available",
    value: 300,
    unit: "seconds",
    explanation:
      "Сумма времени завершённых попыток, включая паузы. Не влияет на балл.",
  },
  assistance_available: false,
};

test("teacher configures learning intent and assessment removes assistance", async ({
  page,
}, info) => {
  await page.goto("/login");
  await page.getByLabel("Логин").fill("teacher");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/teacher$/);
  await page.route("**/api/v1/scenarios/scenario", (route) =>
    route.fulfill({ json: { id: "scenario", role: "operator_112" } }),
  );
  await page.goto("/training?group=group&scenario=scenario&title=Пожар");
  await page
    .getByRole("button", { name: "Отработка навыка", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Назначить задание", exact: true })
    .click();
  await expect(page.locator(".form-validation-summary")).toContainText(
    "Выберите хотя бы один навык для отработки.",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Адрес происшествия", exact: true })
    .click();
  await page.getByLabel("Учебная цель").fill(learning.objective);
  await page.getByRole("combobox", { name: "Максимальная помощь" }).click();
  await page.getByRole("option", { name: "Объяснение действия" }).click();
  await expect(page.getByText(/После паузы система напоминает/)).toBeVisible();
  await page
    .locator(".learning-settings")
    .screenshot({ path: info.outputPath("teacher-settings.png") });
  await page
    .getByRole("button", { name: "Контрольное занятие", exact: false })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Максимальная помощь" }),
  ).toHaveAttribute("aria-disabled", "true");
  await expect(
    page.getByRole("combobox", { name: "Максимальная помощь" }),
  ).toHaveText("Без подсказок");
  await page.route("**/api/v1/lessons/start", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.learning.kind).toBe("assessment");
    expect(body.learning.target_skills).toEqual([]);
    expect(body.learning.assistance).toEqual(
      defaultLearningPolicy().assistance,
    );
    expect(body).not.toHaveProperty("mode");
    await route.fulfill({
      status: 201,
      json: { id: "new-lesson", learning: body.learning },
    });
  });
  await page
    .getByRole("button", { name: "Назначить задание", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Контрольное занятие");
  await expect(page.locator(".MuiDialog-container")).toHaveCSS("opacity", "1");
  await page
    .getByRole("dialog")
    .screenshot({ path: info.outputPath("teacher-confirmation.png") });
  await page.getByRole("button", { name: "Подтвердить назначение" }).click();
  await expect(page).toHaveURL(/training\/new-lesson$/);
  const request = page.waitForRequest(
    (r) =>
      r.url().includes("views/lessons") &&
      new URL(r.url()).searchParams.get("kind") === "assessment",
  );
  await page.getByRole("combobox", { name: "Вид занятия" }).click();
  await page.getByRole("option", { name: "Контрольное занятие" }).click();
  await request;
});

test("student sees separate progress tracks and unmeasured dimensions", async ({
  page,
}, info) => {
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
        groups: ["Группа 1"],
        active_lessons: {
          items: [
            {
              ...row,
              work_status: "in_progress",
              status: "active",
              completed_count: 1,
            },
          ],
          total: 1,
          limit: 6,
          offset: 0,
        },
        performance: {
          total_lessons: 5,
          completed_lessons: 4,
          graded_lessons: 4,
          overall_percent: 85,
          recent_percent: 85,
          recent_count: 4,
          recent_limit: 5,
          recent_lessons: [row],
          tracks: [
            {
              track: "training",
              overall_percent: 80,
              recent_percent: 80,
              recent_count: 3,
              graded_lessons: 3,
              recent_lessons: [row],
            },
            {
              track: "assessment",
              overall_percent: 100,
              recent_percent: 100,
              recent_count: 1,
              graded_lessons: 1,
              recent_lessons: [
                {
                  ...row,
                  lesson_id: "control",
                  score: "100",
                  learning: { ...defaultLearningPolicy(), kind: "assessment" },
                },
              ],
            },
          ],
        },
      },
    }),
  );
  await page.route("**/api/v1/student/lessons/lesson", (route) =>
    route.fulfill({
      json: {
        id: "lesson",
        title: row.title,
        status: "finished",
        work_status: "submitted",
        started_at: row.started_at,
        ended_at: row.completed_at,
        assignments: [],
        learning,
        learning_result: result,
      },
    }),
  );
  await page.route("**/api/v1/student/lessons/lesson/evaluation", (route) =>
    route.fulfill({
      json: {
        id: "grade",
        score: "80",
        max_score: "100",
        method: "rules",
        comment: "Проверены формальные поля",
        revision: 1,
        created_at: row.completed_at,
      },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("Логин").fill("student1");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Общая успеваемость: 80%" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Контрольные занятия", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Общая успеваемость: 100%" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("student-dashboard.png"),
    fullPage: true,
  });
  await page.goto("/results/lesson");
  await expect(page.getByText("Не оценивалось", { exact: true })).toHaveCount(
    2,
  );
  await expect(
    page.getByRole("region", { name: "Условия обучения" }),
  ).toContainText("80%");
  await page.screenshot({
    path: info.outputPath("student-result.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Отработка навыка", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("student-result-mobile.png"),
    fullPage: true,
  });
});
