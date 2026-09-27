import { test, expect } from "./auth-fixture";

test("photo upload explains invalid content and the 1 MB limit before sending", async ({
  page,
}) => {
  let uploads = 0;
  page.on("request", (request) => {
    if (request.method() === "PUT" && request.url().endsWith("/photo"))
      uploads++;
  });
  await page.route("**/api/v1/student/overview*", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "demo-student-1",
          username: "student1",
          first_name: "Анна",
          last_name: "Смирнова",
          middle_name: null,
        },
        groups: [],
        active_lessons: { items: [], total: 0, offset: 0, limit: 6 },
        available_lessons: { items: [], total: 0, offset: 0, limit: 6 },
        performance: {
          total_lessons: 0,
          completed_lessons: 0,
          graded_lessons: 0,
          overall_percent: null,
          recent_percent: null,
          recent_count: 0,
          recent_limit: 5,
          recent_lessons: [],
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
    }),
  );
  await page.goto("/login");
  await page.getByLabel("Логин").fill("student1");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL("/student");
  await page.getByRole("button", { name: "Открыть мой профиль" }).click();
  const profile = page.getByRole("dialog", { name: "Мой профиль" });

  for (const [name, buffer, message] of [
    [
      "fake.png",
      Buffer.from("This is not an image"),
      "Не удалось открыть фотографию",
    ],
    [
      "large.png",
      Buffer.alloc(1024 * 1024 + 1),
      "Файл должен быть не больше 1 МБ.",
    ],
  ] as const) {
    await profile
      .locator('input[type="file"]')
      .setInputFiles({ name, mimeType: "image/png", buffer });
    const dialog = page.getByRole("dialog", { name: "Настроить фотографию" });
    await expect(dialog.getByRole("alert")).toContainText(message);
    await expect(
      dialog.getByRole("button", { name: "Сохранить фотографию", exact: true }),
    ).toBeDisabled();
    if (name === "large.png") {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({
        path: `docs/screenshots/upload-validation/${process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH ? "firefox" : "chromium"}-photo-size-limit.png`,
        animations: "disabled",
      });
    }
    await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  }
  expect(uploads).toBe(0);
});
