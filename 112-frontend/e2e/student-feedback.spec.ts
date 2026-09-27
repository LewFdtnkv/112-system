import { test, expect } from "./auth-fixture";
import { defaultLearningPolicy } from "../src/entities/training/model/learning";

const finding = {
  code: "dds.comments",
  label: "Согласованность комментариев бригад",
  verdict: "incorrect",
  credit: 0,
  applied: true,
  reason:
    "Комментарий «ХИХХАХАХВАХФВОХАОШХВЫАХ» не содержит понятных сведений и не объясняет событие прибытия. Комментарий «ненавижу учиться» не связан с отменой задания.",
  recommendation:
    "Комментарии должны быть понятными и соответствовать событию.",
  reference_quote: "Вы приняли карточку в работу.",
  answer_quote: JSON.stringify([
    {
      crew: "Учебная бригада № 1",
      status: "arrived",
      comment: "ХИХХАХАХВАХФВОХАОШХВЫАХ",
    },
    {
      crew: "Учебная бригада № 2",
      status: "cancelled",
      comment: "ненавижу учиться",
    },
  ]),
};
const feedback = {
  submitted: true,
  cards: [
    {
      assignment_id: "first",
      position: 1,
      title: "Начало работы бригад",
      status: "succeeded",
      findings: [
        {
          ...finding,
          verdict: "correct",
          credit: 1,
          reason:
            "Комментарии соответствуют сообщениям о прибытии и выезде бригад.",
          answer_quote: "Бригада прибыла к месту происшествия",
          recommendation: "",
        },
      ],
    },
    {
      assignment_id: "second",
      position: 2,
      title: "Продолжение смены",
      status: "succeeded",
      findings: [finding],
    },
  ],
};

async function openResult(page: import("@playwright/test").Page) {
  await page.route("**/api/v1/student/lessons/lesson", (route) =>
    route.fulfill({
      json: {
        id: "lesson",
        title: "Тест",
        learning: defaultLearningPolicy(),
        work_status: "submitted",
        assignments: [],
      },
    }),
  );
  await page.route("**/api/v1/student/lessons/lesson/evaluation", (route) =>
    route.fulfill({
      json: {
        id: "grade",
        method: "hybrid",
        score: "90.00",
        max_score: "100.00",
        revision: 2,
        comment: "Автоматическая оценка по правилам и смысловым критериям.",
        created_at: "2026-09-27T08:00:00Z",
      },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("Логин").fill("student1");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL("/student");
  await page.goto("/results/lesson");
}

test("student sees each card's AI reasons, readable crew quotes and recommendations", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.route("**/api/v1/student/lessons/lesson/feedback", (route) =>
    route.fulfill({ json: feedback }),
  );
  await openResult(page);
  await expect(
    page.getByRole("heading", { name: "Разбор ИИ по карточкам" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "2. Продолжение смены" }),
  ).toBeVisible();
  await expect(page.getByText(finding.reason, { exact: true })).toBeVisible();
  await expect(
    page.getByText(finding.recommendation, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Учебная бригада № 1 · Прибытие: ХИХ/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Повторить смысловую проверку|память/ }),
  ).toHaveCount(0);
  expect(
    requests.some(
      (url) =>
        url.includes("assessment-memory") || /students\/.*\/work/.test(url),
    ),
  ).toBe(false);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.screenshot({
    path: "docs/screenshots/student-feedback/desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText(finding.reason, { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/student-feedback/mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("student sees pending, failed, uncertain and unstarted cards without invented verdicts", async ({
  page,
}) => {
  await page.route("**/api/v1/student/lessons/lesson/feedback", (route) =>
    route.fulfill({
      json: {
        submitted: true,
        cards: [
          {
            assignment_id: "a",
            position: 1,
            title: "Ожидает",
            status: "running",
            findings: [],
          },
          {
            assignment_id: "b",
            position: 2,
            title: "Ошибка проверки",
            status: "failed",
            findings: [],
          },
          {
            assignment_id: "c",
            position: 3,
            title: "Пропущена",
            status: "not_started",
            findings: [],
          },
          {
            assignment_id: "d",
            position: 4,
            title: "Спорный ответ",
            status: "succeeded",
            findings: [
              {
                ...finding,
                applied: false,
                credit: null,
                verdict: "uncertain",
                reason: "Нужна проверка преподавателя.",
              },
            ],
          },
        ],
      },
    }),
  );
  await openResult(page);
  await expect(page.getByText(/ИИ проверяет ответ/)).toBeVisible();
  await expect(
    page.getByText(/Смысловая проверка не завершилась/),
  ).toBeVisible();
  await expect(page.getByText(/Карточка не начата и учтена/)).toBeVisible();
  await expect(
    page.getByText("Автоматически в балл не включено."),
  ).toBeVisible();
});
