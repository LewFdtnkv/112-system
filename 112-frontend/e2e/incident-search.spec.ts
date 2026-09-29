import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";

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

test("incident search filters the complete catalog from one character without new requests", async ({
  page,
}) => {
  const fixture = await mockBusiness(page);
  const base = fixture.currentAttempt().classifier_entry;
  const catalog = Array.from({ length: 100 }, (_, i) => ({
    ...base,
    id: `entry-${i}`,
    code: `CASE.${i}`,
    name: `Случай ${i}`,
    display_name: `Случай ${i}`,
    is_popular: i < 14,
    popular_order: i,
  }));
  catalog.push({
    ...base,
    id: "fire",
    code: "TRAIN.101",
    name: "Происшествие 101",
    display_name: "Пожар",
    is_popular: false,
    popular_order: 100,
  });
  catalog.push({
    ...base,
    id: "tree",
    code: "TRAIN.TREE",
    name: "Дерево",
    display_name: "Ёлка на проводах",
    is_popular: false,
    popular_order: 101,
  });
  const offsets: number[] = [];
  await page.route(
    "**/api/v1/student/attempts/attempt/classifier-entries*",
    (route) => {
      const url = new URL(route.request().url());
      expect(url.searchParams.has("q")).toBe(false);
      expect(url.searchParams.has("popular")).toBe(false);
      const offset = Number(url.searchParams.get("offset"));
      offsets.push(offset);
      return route.fulfill({
        json: catalog.slice(
          offset,
          offset + Number(url.searchParams.get("limit")),
        ),
      });
    },
  );
  await page.route("**/api/v1/telephony/attempts/attempt", (r) =>
    r.fulfill({
      json: { enabled: false, station: null, active_call: null, calls: [] },
    }),
  );
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/login");
  await page.getByLabel("Логин").fill("student1");
  await page.getByLabel("Пароль", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/student$/);
  await page.goto("/student/sessions/lesson");
  await page
    .getByRole("button", { name: "Продолжить заполнение", exact: true })
    .click();
  await expect(page.locator(".arm-card-dialog .MuiDialog-container")).toHaveCSS(
    "opacity",
    "1",
  );
  await page
    .getByRole("button", { name: "Убрать тип происшествия", exact: true })
    .click();
  await expect(page.locator(".arm-category-choices button")).toHaveCount(11);
  const input = page.getByLabel("Тип происшествия", { exact: true });
  const results = page.locator(".arm-category-results");
  await input.focus();
  await expect(
    page.getByText(/Введите не менее.*символов для поиска/),
  ).toHaveCount(0);
  await expect(results).toHaveCount(0);
  await input.fill("п");
  await expect(
    results.getByRole("button", { name: "Пожар", exact: true }),
  ).toBeVisible();
  await expect(results.getByRole("button")).toHaveCount(2);
  await expect(results).not.toContainText("TRAIN.");
  await page.screenshot({
    path: `docs/screenshots/incident-search/${browserName}-one-character.png`,
    animations: "disabled",
  });
  await input.fill(" еЛ ");
  await expect(
    results.getByRole("button", { name: "Ёлка на проводах", exact: true }),
  ).toBeVisible();
  await expect(results.getByRole("button")).toHaveCount(1);
  await input.fill("%");
  await expect(results).toContainText("Тип происшествия не найден");
  await input.fill("   ");
  await expect(results).toHaveCount(0);
  await expect(page.locator(".arm-category-choices button")).toHaveCount(11);
  await input.fill("П");
  await results.getByRole("button", { name: "Пожар", exact: true }).click();
  await expect(page.locator(".arm-category-tab")).toContainText("Пожар");
  await expect
    .poll(() => fixture.currentAttempt().card.classifier_entry_id)
    .toBe("fire");
  expect(offsets).toEqual([0, 100]);
  await page.setViewportSize({ width: 390, height: 844 });
  await input.fill("п");
  await expect(
    results.getByRole("button", { name: "Пожар", exact: true }),
  ).toBeVisible();
  await expect(
    results.getByRole("button", { name: "Пожар", exact: true }),
  ).toBeInViewport();
  const listBox = await results.boundingBox();
  const footer = await page.locator(".arm-card-footer").boundingBox();
  expect(listBox!.y + listBox!.height).toBeLessThanOrEqual(footer!.y + 1);
  expect(
    await page
      .locator(".arm-card-dialog .MuiDialog-paper")
      .evaluate((el) => el.scrollTop),
  ).toBe(0);
  await page.screenshot({
    path: `docs/screenshots/incident-search/${browserName}-mobile.png`,
    animations: "disabled",
  });
});
