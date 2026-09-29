import { test, expect } from "./auth-fixture";

const browserName = process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH
  ? "firefox"
  : "chromium";
test.use({
  browserName,
  launchOptions: {
    executablePath:
      browserName === "firefox"
        ? process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH
        : process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  },
});

test("crop photo: preview, keyboard and drag, cancel, retry and square upload", async ({
  page,
}) => {
  let uploads = 0;
  let profileSaves = 0;
  let payload: Buffer | null = null;
  let fail = true;
  await page.route("**/api/v1/users/me/photo", (route) => {
    if (route.request().method() !== "PUT")
      return route.fulfill({ status: 204 });
    uploads++;
    if (fail)
      return route.fulfill({
        status: 422,
        json: {
          detail: "Choose a valid PNG or JPEG photo up to 16 megapixels",
        },
      });
    payload = route.request().postDataBuffer();
    return route.fulfill({ status: 204 });
  });
  page.on("request", (request) => {
    if (request.method() === "PATCH") profileSaves++;
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
            track, graded_lessons: 0, overall_percent: null, recent_percent: null,
            recent_count: 0, recent_lessons: [],
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
  const photo = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 900;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#c7dce3";
    ctx.fillRect(0, 0, 800, 900);
    ctx.fillStyle = "#316985";
    ctx.beginPath();
    ctx.ellipse(410, 810, 280, 290, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#50392d";
    ctx.beginPath();
    ctx.ellipse(410, 325, 174, 205, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8b78f";
    ctx.beginPath();
    ctx.ellipse(410, 350, 150, 180, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#50392d";
    ctx.beginPath();
    ctx.ellipse(410, 200, 160, 60, -0.15, 0, Math.PI * 2);
    ctx.fill();
    for (const x of [355, 465]) {
      ctx.beginPath();
      ctx.ellipse(x, 340, 12, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#864e3d";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(410, 385, 45, 0.2, Math.PI - 0.2);
    ctx.stroke();
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const file = {
    name: "portrait.png",
    mimeType: "image/png",
    buffer: Buffer.from(photo, "base64"),
  };
  await profile.locator('input[type="file"]').setInputFiles(file);
  const dialog = page.getByRole("dialog", { name: "Настроить фотографию" });
  const canvas = dialog.locator("canvas");
  await expect(canvas).toBeVisible();
  const original = await canvas.evaluate((el: HTMLCanvasElement) =>
    el.toDataURL(),
  );
  await canvas.press("ArrowDown");
  await expect
    .poll(() => canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL()))
    .not.toBe(original);
  await dialog
    .getByRole("button", { name: "Сбросить положение и масштаб" })
    .click();
  await expect
    .poll(() => canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL()))
    .toBe(original);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 - 10,
    box.y + box.height / 2 + 30,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect
    .poll(() => canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL()))
    .not.toBe(original);
  const slider = dialog.getByRole("slider", { name: "Масштаб" });
  await slider.focus();
  for (let i = 0; i < 50; i++) await slider.press("ArrowRight");
  expect(uploads).toBe(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: `docs/screenshots/photo-crop/${browserName}-desktop.png`,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `docs/screenshots/photo-crop/${browserName}-mobile.png`,
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  expect(uploads).toBe(0);
  await profile.locator('input[type="file"]').setInputFiles(file);
  await expect(canvas).toBeVisible();
  await expect
    .poll(() => canvas.evaluate((el: HTMLCanvasElement) => el.toDataURL()))
    .toBe(original);
  const save = dialog.getByRole("button", {
    name: "Сохранить фотографию",
    exact: true,
  });
  await save.click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(canvas).toBeVisible();
  fail = false;
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(uploads).toBe(2);
  expect(profileSaves).toBe(0);
  expect(payload).not.toBeNull();
  expect(payload!.length).toBeLessThan(2_000_000);
  const dimensions = await page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/jpeg;base64,${base64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const size = [bitmap.width, bitmap.height];
    bitmap.close();
    return size;
  }, payload!.toString("base64"));
  expect(dimensions).toEqual([512, 512]);
  await profile.locator('input[type="file"]').setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("bad image"),
  });
  await expect(dialog.getByText(/Не удалось открыть фотографию/)).toBeVisible();
  await expect(save).toBeDisabled();
  expect(uploads).toBe(2);
});
