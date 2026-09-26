import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";
import { defaultLearningPolicy } from "../src/entities/training/model/learning";
import type {
  StudentLesson,
  LessonRow,
} from "../src/entities/training/model/types";
import type { Page } from "@playwright/test";

async function setup(page: Page, timed = false) {
  const business = await mockBusiness(page);
  const learning = defaultLearningPolicy();
  const attempt = business.currentAttempt();
  let started = false;
  let opened = false;
  let paused: string | null = null;
  let session = 0;
  let starts = 0;
  let startsAt: string | null = null;
  const calls: string[] = [];
  const lesson = (): StudentLesson => ({
    id: "lesson",
    title: "Приём сообщения о пожаре",
    learning,
    status: "active",
    work_status: started ? "in_progress" : "assigned",
    started_at: null,
    ended_at: null,
    execution_started_at: startsAt,
    paused_at: paused,
    presence_session_id: started ? `visit-${session}` : null,
    time_limit_seconds: timed ? 600 : null,
    deadline_at:
      timed && startsAt
        ? new Date(Date.parse(startsAt) + 600000).toISOString()
        : null,
    assignments: [
      {
        id: "assignment",
        position: 1,
        title: "Сообщение о пожаре",
        role: "operator_112",
        available: true,
        attempt_id: opened ? "attempt" : null,
        status: opened ? "in_progress" : "pending",
        card: opened
          ? {
              id: "card",
              display_number: 1042,
              started_at: attempt.started_at,
              status: "draft",
              address_text: attempt.card.data.address_text,
              description: attempt.card.data.description,
              caller_name: attempt.card.data.caller_name,
              caller_phone: attempt.card.data.caller_phone,
              classifier_entry_id: "entry",
              category_name: "101",
            }
          : null,
      },
    ],
  });
  const row = (
    id: string,
    role: "dds" | "operator_112",
    state: "assigned" | "in_progress",
  ): LessonRow => ({
    lesson_id: id,
    title:
      id === "lesson"
        ? "Приём сообщения о пожаре"
        : "Направление пожарной бригады",
    scenario_title:
      id === "lesson" ? "Пожар в жилом доме" : "Обработка карточки службой 101",
    role,
    learning,
    student_id: "demo-student-1",
    student_name: "Анна Смирнова",
    scenario_version_id: "scenario",
    group_name: "Учебная группа",
    started_at: startsAt,
    ended_at: null,
    status: "active",
    work_status: state,
    card_count: 3,
    completed_count: 0,
    score: null,
    max_score: null,
    evaluation_revision: null,
    paused_at: id === "lesson" ? paused : null,
    time_limit_seconds: id === "lesson" && timed ? 600 : null,
  });
  await page.route("**/api/v1/student/lessons/lesson", (r) =>
    r.fulfill({ json: lesson() }),
  );
  await page.route("**/api/v1/student/lessons/lesson/start", (r) => {
    started = true;
    paused = null;
    session++;
    starts++;
    startsAt ??= new Date().toISOString();
    calls.push("start");
    return r.fulfill({ json: lesson() });
  });
  await page.route("**/api/v1/student/assignments/assignment/start", (r) => {
    opened = true;
    return r.fulfill({ json: business.currentAttempt() });
  });
  await page.route("**/api/v1/student/lessons/lesson/leave", (r) => {
    calls.push("leave");
    paused = new Date().toISOString();
    return r.fulfill({ status: 204 });
  });
  await page.route("**/api/v1/student/lessons/lesson/presence", (r) =>
    r.fulfill({ status: 204 }),
  );
  page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().endsWith("/card")) calls.push("save");
  });
  await page.route("**/api/v1/student/overview*", (r) => {
    const own = row(
      "lesson",
      "operator_112",
      started ? "in_progress" : "assigned",
    );
    const active = started && !paused ? [own] : [];
    const available = [
      ...(!started || paused ? [own] : []),
      row("dds", "dds", "assigned"),
    ];
    return r.fulfill({
      json: {
        user: {
          id: "demo-student-1",
          username: "student1",
          first_name: "Анна",
          last_name: "Смирнова",
          is_active: true,
          is_teacher: false,
          is_admin: false,
        },
        groups: ["Учебная группа"],
        active_lessons: {
          items: active,
          total: active.length,
          limit: 6,
          offset: 0,
        },
        available_lessons: {
          items: available,
          total: available.length,
          limit: 6,
          offset: 0,
        },
        performance: {
          total_lessons: 2,
          completed_lessons: 0,
          graded_lessons: 0,
          recent_count: 0,
          recent_limit: 5,
          recent_lessons: [],
          overall_percent: null,
          recent_percent: null,
          tracks: ["training", "assessment"].map((track) => ({
            track,
            graded_lessons: 0,
            overall_percent: null,
            recent_percent: null,
            recent_count: 0,
            recent_lessons: [],
          })),
        },
      },
    });
  });
  await page.route("**/api/v1/telephony/attempts/*", (r) =>
    r.fulfill({ json: { enabled: false, station: null, cues: [], calls: [] } }),
  );
  return { calls, starts: () => starts, lesson };
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill("student1");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/student$/);
}

for (const timed of [false, true])
  test(`lesson ${timed ? "timed" : "unlimited"}: dashboard, exit with draft, resume`, async ({
    page,
  }, info) => {
    const fixture = await setup(page, timed);
    await login(page);
    const available = page.getByRole("region", { name: "Доступные занятия 2" });
    await expect(
      available.getByText("Оператор ДДС", { exact: true }),
    ).toBeVisible();
    await expect(
      available.getByText("Оператор 112", { exact: true }),
    ).toBeVisible();
    await expect(available).not.toContainText("Можно начать");
    await expect(available).not.toContainText("В процессе");
    await page.screenshot({
      path: info.outputPath("dashboard.png"),
      fullPage: true,
      animations: "disabled",
    });
    await available.getByRole("link").first().click();
    await expect(
      page.getByText(
        timed ? /На всё занятие — 10 мин/ : /Без лимита минут. При выходе/,
      ),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("start.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Приступить к заданию" }).click();
    await page.getByRole("button", { name: "Подтвердить начало" }).click();
    await page.getByRole("button", { name: "Начать следующую карточку" }).click();
    await page
      .getByLabel("Сообщение со слов заявителя", { exact: true })
      .fill("Черновик сохранён перед выходом");
    const dialog = page.locator(".arm-card-dialog");
    if (timed)
      await expect(dialog.getByRole("timer")).toContainText(
        "До конца занятия: 9:",
      );
    await dialog
      .getByRole("button", { name: "Выйти из занятия", exact: true })
      .click();
    await expect(page).toHaveURL(/student$/);
    expect(fixture.calls.indexOf("save")).toBeLessThan(
      fixture.calls.indexOf("leave"),
    );
    await expect(
      page.getByRole("region", { name: "Активные занятия 0" }),
    ).toBeVisible();
    await page
      .getByRole("region", { name: "Доступные занятия 2" })
      .getByRole("link")
      .first()
      .click();
    await page
      .getByRole("button", { name: "Продолжить занятие", exact: true })
      .click();
    await page.getByRole("button", { name: "Подтвердить начало" }).click();
    await page.getByRole("button", { name: "Продолжить заполнение" }).click();
    await expect(
      page.getByLabel("Сообщение со слов заявителя", { exact: true }),
    ).toHaveValue("Черновик сохранён перед выходом");
    expect(fixture.starts()).toBe(2);
    await page.screenshot({
      path: info.outputPath("card.png"),
      animations: "disabled",
    });
    await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
    await page
      .getByRole("button", { name: "Выйти из занятия", exact: true })
      .click();
    await expect(page).toHaveURL(/student$/);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: info.outputPath("dashboard-mobile.png"),
      fullPage: true,
      animations: "disabled",
    });
  });

test("dashboard shows current work separately from available DDS lessons", async ({
  page,
}, info) => {
  await setup(page, true);
  await login(page);
  await page.evaluate(() =>
    fetch("/api/v1/student/lessons/lesson/start", { method: "POST" }),
  );
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Активные занятия 1" }).getByRole("link"),
  ).toHaveCount(1);
  await expect(
    page
      .getByRole("region", { name: "Доступные занятия 1" })
      .getByText("Оператор ДДС", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("dashboard-active.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(390);
  await page.screenshot({
    path: info.outputPath("dashboard-active-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("teacher assigns a single limit in minutes for the entire lesson", async ({
  page,
}, info) => {
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/api/v1/scenarios/scenario", (r) =>
    r.fulfill({
      json: { id: "scenario", role: "operator_112", difficulty: "easy" },
    }),
  );
  await page.route("**/api/v1/lessons/start", (r) => {
    submitted = r.request().postDataJSON();
    return r.fulfill({ json: { id: "lesson" } });
  });
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill("teacher");
  await page.getByLabel("Пароль", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/teacher$/);
  await page.goto("/training?group=group&scenario=scenario&title=Пожар");
  await page.getByLabel("Время на занятие, минут (необязательно)").fill("25");
  await page.screenshot({
    path: info.outputPath("teacher-timing.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Назначить задание", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "25 мин с начала выполнения",
  );
  await page
    .getByRole("button", { name: "Подтвердить назначение", exact: true })
    .click();
  await expect.poll(() => submitted?.time_limit_seconds).toBe(1500);
});
