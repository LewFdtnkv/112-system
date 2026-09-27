import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";
import { defaultLearningPolicy } from "../src/entities/training/model/learning";

const summary = {
  status: "partial",
  pending_cards: 0,
  failed_cards: 0,
  reviewed_cards: 1,
  applied_criteria: 1,
  needs_review: 1,
  semantic_weight_percent: 20,
};
const grade = {
  id: "grade",
  method: "hybrid",
  score: "90.00",
  max_score: "100.00",
  revision: 2,
  created_at: "2026-09-23T14:00:00Z",
  comment:
    "Учтена обоснованная дополнительная служба. Описание требует проверки.",
  assessment_details: {
    semantic: summary,
    policy_version: "semantic-v1",
    scope: "partial",
    criteria: [
      {
        code: "notification",
        label: "Оповещение служб",
        score: 25,
        max_score: 25,
        explanation: "Дополнительная служба обоснована",
      },
    ],
    unverified_fields: 1,
    evaluated_cards: 1,
    recommendations: ["Уточните сведения о пострадавшем."],
  },
};

test("semantic assessment: teacher sees evidence, uncertainty and preserved ARM", async ({
  page,
}) => {
  const business = await mockBusiness(page);
  await page.route("**/api/v1/**/assessment-memory", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/v1/**/proctoring*", (route) =>
    route.fulfill({ json: { items: [], total: 0, limit: 20, offset: 0 } }),
  );
  const attempt = {
    ...business.currentAttempt(),
    status: "completed",
    ended_at: "2026-09-23T14:00:00Z",
  };
  const row = {
    assignment_id: "assignment",
    position: 1,
    attempt,
    automatic_check: null,
    source_classifier_entry: attempt.classifier_entry,
    source_snapshot: {
      title: "Пожар с пострадавшим",
      caller_message: "На кухне дым из розетки, мужчина обжёг руку.",
      data: attempt.card.data,
      recipients: attempt.recipient_services,
    },
    semantic_review: {
      status: "succeeded",
      model: "qwen3:4b-instruct-2507-q4_K_M",
      prompt_version: "semantic-v1",
      error: null,
      process: {
        server_event_count: 8,
        browser_event_count: 12,
        hints_count: 1,
        max_gap_between_server_events_seconds: 46,
        hints: [
          {
            event_id: "hint",
            text: "Проверьте сведения о пострадавших.",
            next_action: "card.draft_saved",
            seconds_to_next_action: 12,
          },
        ],
      },
      findings: [
        {
          code: "additional_services",
          label: "Дополнительные службы",
          verdict: "correct",
          credit: 1,
          applied: true,
          reason: "Скорая помощь обоснована сообщением об ожоге.",
          recommendation: "",
          reference_quote: "мужчина обжёг руку",
          answer_quote: "Скорая медицинская помощь",
        },
        {
          code: "description",
          label: "Смысл сообщения",
          verdict: "uncertain",
          credit: null,
          applied: false,
          reason: "Два прохода модели разошлись в оценке полноты сообщения.",
          recommendation: "Преподавателю следует проверить описание.",
          reference_quote: "дым из розетки",
          answer_quote: "Дым из окна",
        },
      ],
    },
  };
  await page.route(
    "**/api/v1/lessons/lesson/students/demo-student-1/work",
    (route) =>
      route.fulfill({
        json: {
          lesson_id: "lesson",
          student_id: "demo-student-1",
          learning: defaultLearningPolicy(),
          submitted: true,
          assignments: [row],
          evaluations: [grade],
          automatic_check: { fields: [] },
        },
      }),
  );
  await page.goto("/login");
  await page.getByLabel("Логин").fill("teacher");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.goto("/results/lesson?student=demo-student-1");
  await expect(
    page.getByRole("heading", { name: "Смысловая проверка ИИ" }),
  ).toBeVisible();
  await expect(
    page.getByText("Скорая помощь обоснована сообщением об ожоге."),
  ).toBeVisible();
  await expect(
    page.getByText("Автоматически в балл не включено."),
  ).toBeVisible();
  await page
    .getByText("Процесс выполнения и подсказки", { exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.screenshot({
    path: "docs/screenshots/interface-copy/assessment-teacher.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Ответ в АРМ", exact: true }).click();
  await expect(page.getByLabel("Навигация по карточкам работы")).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/interface-copy/assessment-arm.png",
    fullPage: false,
    animations: "disabled",
  });
});

test("semantic assessment: student sees incomplete grade and recommendations", async ({
  page,
}) => {
  await page.route("**/api/v1/student/lessons/lesson/evaluation", (route) =>
    route.fulfill({ json: grade }),
  );
  await page.goto("/login");
  await page.getByLabel("Логин").fill("student1");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.goto("/results/lesson");
  await expect(page.getByText("Что повторить")).toBeVisible();
  await expect(page.getByText(/Смысловая проверка неполная/)).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "docs/screenshots/interface-copy/assessment-student.png",
    fullPage: true,
    animations: "disabled",
  });
});
