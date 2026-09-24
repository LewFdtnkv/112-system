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

test("teacher publishes and withdraws an assessment memory example", async ({
  page,
}) => {
  const business = await mockBusiness(page);
  let entries: Record<string, unknown>[] = [];
  await page.route("**/assessment-memory", async (route) => {
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      expect(input.criterion_code).toBe("additional_services");
      entries = [
        {
          ...input,
          id: "example",
          active: true,
          embedded_at: null,
          created_at: "2026-09-24T09:00:00Z",
        },
      ];
      return route.fulfill({ json: entries[0] });
    }
    return route.fulfill({ json: entries });
  });
  await page.route("**/assessment-memory/example", (route) => {
    entries = entries.map((e) => ({ ...e, active: false }));
    return route.fulfill({ json: entries[0] });
  });
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
    .getByRole("button", { name: "Сохранить свой разбор" })
    .first()
    .click();
  await page
    .getByLabel("Почему такой вердикт верен")
    .fill(
      "Ожог обосновывает медицинскую помощь, дополнительная служба выбрана верно.",
    );
  await expect(
    page.getByRole("button", { name: "Использовать в будущих проверках" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "docs/screenshots/assessment-memory/editor.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Использовать в будущих проверках" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/Ваш разбор:/)).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/assessment-memory/saved.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Исключить из памяти" }).click();
  await expect(page.getByText(/Ваш разбор:/)).toHaveCount(0);
  await page
    .getByText("Процесс выполнения и подсказки", { exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.screenshot({
    path: "docs/screenshots/assessment-memory/teacher.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Ответ в АРМ", exact: true }).click();
  await expect(page.getByLabel("Навигация по карточкам работы")).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/assessment-memory/arm.png",
    fullPage: true,
    animations: "disabled",
  });
});
