import { test, expect } from "./auth-fixture";

const measure = (checked: number, errors: number) => ({
  checked,
  errors,
  error_percent: checked ? Math.round((errors * 100) / checked) : 0,
});

test("teacher explores card errors, filters and opens a student's result", async ({
  page,
}) => {
  const requests: URL[] = [];
  const field = {
    key: "address_details.street",
    label: "Улица",
    role: "operator_112",
    ...measure(12, 8),
  };
  const cards = [
    {
      key: "fire",
      title: "Пожар в жилом доме",
      role: "operator_112",
      students: 9,
      ...measure(12, 8),
      skills: { address: measure(12, 8), notification: measure(12, 3) },
      fields: [field],
      examples: [
        {
          lesson_id: "lesson",
          student_id: "student",
          student: "Анна Смирнова",
          position: 2,
        },
      ],
    },
    {
      key: "traffic",
      title: "ДТП на перекрёстке",
      role: "operator_112",
      students: 7,
      ...measure(10, 4),
      skills: { address: measure(10, 2), notification: measure(10, 4) },
      fields: [],
      examples: [],
    },
    {
      key: "dds",
      title: "Продолжение работы пожарного расчёта",
      role: "dds",
      students: 3,
      ...measure(3, 1),
      skills: { dds_timing: measure(3, 1) },
      fields: [],
      examples: [],
    },
  ];
  await page.route("**/api/v1/views/analytics**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith("/errors"))
      return route.fulfill({
        json: {
          total: 10,
          submitted: 10,
          graded: 10,
          average_score_percent: 75,
          scenarios: { items: [], total: 0, offset: 0, limit: 20 },
        },
      });
    requests.push(url);
    const empty = url.searchParams.get("track") === "assessment";
    const items = empty
      ? []
      : cards.filter(
          (c) => url.searchParams.get("role") !== "dds" || c.role === "dds",
        );
    return route.fulfill({
      json: {
        summary: {
          ...measure(empty ? 0 : 25, empty ? 0 : 13),
          students: empty ? 0 : 14,
          teacher_reviewed: 2,
          pending_ai: 1,
          incomplete_ai: 1,
          ungraded: 0,
        },
        skills: [
          { key: "address", label: "Заполнение адреса" },
          { key: "notification", label: "Выбор служб" },
          { key: "dds_timing", label: "Нормативы времени" },
        ],
        fields: empty ? [] : [field],
        cards: { items, total: items.length, limit: 20, offset: 0 },
      },
    });
  });
  await page.goto("/login");
  await page.getByLabel("Логин").fill("teacher");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/teacher$/);
  await page.goto("/analytics");
  await expect(
    page.getByRole("heading", { name: "Типичные ошибки" }),
  ).toBeVisible();
  const heat = page.getByRole("table", { name: "Тепловая карта ошибок" });
  await expect(heat.getByText("Мало данных")).toBeVisible();
  await heat.getByRole("button", { name: "Пожар в жилом доме" }).click();
  await expect(page.getByText("Улица: 8 из 12 проверок (67%)")).toBeVisible();
  const result = page.getByRole("link", { name: "Анна Смирнова · карточка 2" });
  await expect(result).toHaveAttribute("target", "_blank");
  await expect(result).toHaveAttribute(
    "href",
    "/results/lesson?student=student",
  );
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.screenshot({
    path: "docs/screenshots/error-analytics/desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/error-analytics/mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("combobox", { name: "Оператор", exact: true }).click();
  await page.getByRole("option", { name: "Оператор ДДС", exact: true }).click();
  await expect(
    heat.getByRole("button", { name: "Пожар в жилом доме" }),
  ).toHaveCount(0);
  expect(requests.at(-1)?.searchParams.get("role")).toBe("dds");
  await page
    .getByRole("combobox", { name: "Период завершения карточек" })
    .click();
  await page.getByRole("option", { name: "Последние 30 дней" }).click();
  await expect.poll(() => requests.at(-1)?.searchParams.get("days")).toBe("30");
  await page
    .getByRole("button", { name: "Контрольные занятия", exact: true })
    .click();
  await expect(
    page.getByText("За выбранный период нет проверенных карточек.", {
      exact: false,
    }),
  ).toBeVisible();
});
