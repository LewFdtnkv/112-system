import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";
import type { Page } from "@playwright/test";

const key = "system112-draft-v1:demo-student-1:attempt";
const local = (page: Page) =>
  page.evaluate((name) => {
    const raw = localStorage.getItem(name);
    return raw ? JSON.parse(raw).state.draft : null;
  }, key);

async function open(page: Page, login = true) {
  await page.route("**/api/v1/telephony/attempts/attempt", (route) =>
    route.fulfill({
      json: { enabled: false, station: null, active_call: null, calls: [] },
    }),
  );
  if (login) {
    await page.goto("/login");
    await page.getByLabel("Логин").fill("student1");
    await page.getByLabel("Пароль", { exact: true }).fill("password");
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page).toHaveURL(/student$/);
  }
  await page.goto("/student/sessions/lesson");
  await page
    .getByRole("button", { name: "Продолжить заполнение", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Улица", exact: true }),
  ).toBeVisible();
}

test("restores unsent fields after reload and retries without another edit", async ({
  page,
}) => {
  const fixture = await mockBusiness(page);
  let unavailable = true;
  await page.route("**/api/v1/student/attempts/attempt/card", (route) =>
    unavailable
      ? route.fulfill({ status: 503, json: { detail: "Unavailable" } })
      : route.fallback(),
  );
  await open(page);
  await page
    .getByRole("textbox", { name: "Улица", exact: true })
    .fill("Лесная улица");
  await expect
    .poll(async () => (await local(page))?.fields.address.street)
    .toBe("Лесная улица");
  await expect(
    page.getByText("На сервере пока не сохранено.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await open(page, false);
  await expect(
    page.getByRole("textbox", { name: "Улица", exact: true }),
  ).toHaveValue("Лесная улица");
  await expect(
    page.getByText("На сервере пока не сохранено.", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/local-draft/restored.png",
    fullPage: true,
  });
  unavailable = false;
  await expect
    .poll(() => fixture.currentAttempt().card.data.address_details.street, {
      timeout: 12000,
    })
    .toBe("Лесная улица");
  await expect.poll(() => local(page)).toBeNull();
});

for (const keep of [true, false]) {
  test(`does not overwrite a newer server revision; keep local = ${keep}`, async ({
    page,
  }) => {
    const fixture = await mockBusiness(page);
    let unavailable = true;
    let saves = 0;
    await page.route("**/api/v1/student/attempts/attempt/card", (route) => {
      saves++;
      return unavailable
        ? route.fulfill({ status: 503, json: {} })
        : route.fallback();
    });
    await open(page);
    await page
      .getByRole("textbox", { name: "Улица", exact: true })
      .fill("Мой локальный адрес");
    await expect
      .poll(async () => (await local(page))?.fields.address.street)
      .toBe("Мой локальный адрес");
    fixture.currentAttempt().card.revision += 1;
    fixture.currentAttempt().card.data.address_details.street =
      "Новый серверный адрес";
    await page.reload();
    await open(page, false);
    await expect(
      page.getByText("На сервере другая версия карточки.", { exact: false }),
    ).toBeVisible();
    unavailable = false;
    const previous = saves;
    await page.waitForTimeout(1500);
    expect(saves).toBe(previous);
    if (keep)
      await page.screenshot({
        path: "docs/screenshots/local-draft/conflict.png",
        fullPage: true,
      });
    await page
      .getByRole("button", {
        name: keep ? "Сохранить мой черновик" : "Загрузить серверную версию",
        exact: true,
      })
      .click();
    const expected = keep ? "Мой локальный адрес" : "Новый серверный адрес";
    await expect
      .poll(() => fixture.currentAttempt().card.data.address_details.street)
      .toBe(expected);
    await expect(
      page.getByRole("textbox", { name: "Улица", exact: true }),
    ).toHaveValue(expected);
    await expect.poll(() => local(page)).toBeNull();
  });
}

test("keeps the latest keystrokes while an older save is in flight", async ({
  page,
}) => {
  const fixture = await mockBusiness(page);
  let release!: () => void;
  let started = false;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/student/attempts/attempt/card", async (route) => {
    if (!started) {
      started = true;
      await barrier;
    }
    await route.fallback();
  });
  await open(page);
  const street = page.getByRole("textbox", { name: "Улица", exact: true });
  await street.fill("Первый адрес");
  await expect.poll(() => started).toBe(true);
  await street.fill("Последний адрес");
  release();
  await expect
    .poll(() => fixture.currentAttempt().card.data.address_details.street)
    .toBe("Последний адрес");
  await expect.poll(() => local(page)).toBeNull();
});

test("sends the browser draft when network returns", async ({
  page,
  context,
}) => {
  const fixture = await mockBusiness(page);
  await open(page);
  await context.setOffline(true);
  await page
    .getByRole("textbox", { name: "Улица", exact: true })
    .fill("Адрес без сети");
  await expect
    .poll(async () => (await local(page))?.fields.address.street)
    .toBe("Адрес без сети");
  await page.waitForTimeout(1500);
  await context.setOffline(false);
  await expect
    .poll(() => fixture.currentAttempt().card.data.address_details.street, {
      timeout: 12000,
    })
    .toBe("Адрес без сети");
  await expect.poll(() => local(page)).toBeNull();
});

test("discards a local draft when the server has already ended the attempt", async ({
  page,
}) => {
  const fixture = await mockBusiness(page);
  await page.route("**/api/v1/student/attempts/attempt/card", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await open(page);
  await page
    .getByRole("textbox", { name: "Улица", exact: true })
    .fill("Просроченный ответ");
  await expect
    .poll(async () => (await local(page))?.fields.address.street)
    .toBe("Просроченный ответ");
  fixture.currentAttempt().status = "interrupted";
  await page.reload();
  await open(page, false);
  await expect(
    page.getByRole("textbox", { name: "Улица", exact: true }),
  ).toHaveValue("Учебная улица");
  await expect.poll(() => local(page)).toBeNull();
});
