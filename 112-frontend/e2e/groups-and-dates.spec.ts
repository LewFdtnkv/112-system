import { test, expect } from "./auth-fixture";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Логин").fill("teacher");
  await page.getByLabel("Пароль").fill("test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/teacher$/);
});

test("disband group confirms, handles failure and refreshes the list", async ({
  page,
}, info) => {
  const group = {
    id: "group",
    name: "Группа операторов 112",
    student_count: 12,
  };
  let disbanded = false;
  let requests = 0;
  await page.route("**/api/v1/views/groups*", (route) =>
    route.fulfill({
      json: {
        items: disbanded ? [] : [group],
        total: disbanded ? 0 : 1,
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.route("**/api/v1/groups/group/disband", (route) => {
    requests += 1;
    if (requests === 1)
      return route.fulfill({
        status: 409,
        json: {
          detail: "Не удалось расформировать группу. Повторите действие.",
        },
      });
    disbanded = true;
    return route.fulfill({
      json: { ...group, disbanded_at: new Date().toISOString() },
    });
  });
  await page.goto("/groups");
  const action = page.getByRole("button", {
    name: "Расформировать группу Группа операторов 112",
    exact: true,
  });
  await expect(action).toBeVisible();
  await page.screenshot({
    path: info.outputPath("groups.png"),
    fullPage: true,
  });
  await action.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1); // The row's membership dialog must not open too.
  await expect(dialog).toContainText("занятия, ответы и оценки сохранятся");
  await expect(page.locator(".MuiDialog-container")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: info.outputPath("disband-confirmation.png"),
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(requests).toBe(0);
  await action.click();
  await dialog
    .getByRole("button", { name: "Расформировать группу", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Данные изменились");
  await dialog
    .getByRole("button", { name: "Расформировать группу", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(action).toHaveCount(0);
  expect(requests).toBe(2);
});

test("disband is available from the group members dialog", async ({ page }) => {
  const group = { id: "group", name: "Учебная группа", student_count: 0 };
  let disbanded = false;
  await page.route("**/api/v1/views/groups*", (route) =>
    route.fulfill({
      json: {
        items: disbanded ? [] : [group],
        total: disbanded ? 0 : 1,
        limit: 20,
        offset: 0,
      },
    }),
  );
  await page.route("**/api/v1/groups/group/disband", (route) => {
    disbanded = true;
    return route.fulfill({
      json: { ...group, disbanded_at: new Date().toISOString() },
    });
  });
  await page.goto("/groups");
  await page.getByRole("cell", { name: "Учебная группа", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", {
      name: "Расформировать группу Учебная группа",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog", { name: "Расформировать группу «Учебная группа»?" })
    .getByRole("button", { name: "Расформировать группу", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "Учебная группа", exact: true }),
  ).toHaveCount(0);
});

test("dates clear without submitting and do not leak into the assignment", async ({
  page,
}, info) => {
  await page.route("**/api/v1/scenarios/scenario", (route) =>
    route.fulfill({ json: { id: "scenario", role: "operator_112" } }),
  );
  let submitted = false;
  await page.route("**/api/v1/lessons/start", (route) => {
    const body = route.request().postDataJSON();
    expect(body).not.toHaveProperty("available_from");
    expect(body).not.toHaveProperty("available_until");
    submitted = true;
    return route.fulfill({ status: 201, json: { id: "new-lesson" } });
  });
  await page.goto("/training?group=group&scenario=scenario&title=Пожар");
  const from = page.getByLabel("Дата и время начала", { exact: true });
  const until = page.getByLabel("Дата и время окончания", { exact: true });
  await from.fill("2030-10-01T09:00");
  await until.fill("2030-10-02T17:30");
  await expect(until).toHaveAttribute("min", "2030-10-01T09:00");
  await expect(from).toHaveAttribute("type", "datetime-local");
  await from.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("dates-filled.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: "Очистить: Дата и время окончания",
      exact: true,
    })
    .click();
  await expect(until).toHaveValue("");
  await expect(until).toBeFocused();
  await expect(from).toHaveValue("2030-10-01T09:00");
  await page
    .getByRole("button", { name: "Очистить: Дата и время начала", exact: true })
    .click();
  await expect(from).toHaveValue("");
  await expect(until).not.toHaveAttribute("min");
  // Native partial dates report value=""; the clear button must remain available.
  await from.press("ArrowLeft");
  await from.press("2");
  await page
    .getByRole("button", { name: "Очистить: Дата и время начала", exact: true })
    .click();
  expect(
    await from.evaluate((input: HTMLInputElement) => input.validity.badInput),
  ).toBe(false);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(submitted).toBe(false);
  await page.screenshot({
    path: info.outputPath("dates-cleared.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await until.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("dates-mobile.png") });
  await page
    .getByRole("button", { name: "Назначить задание", exact: true })
    .click();
  await page.getByRole("button", { name: "Подтвердить назначение" }).click();
  await expect(page).toHaveURL(/training\/new-lesson$/);
  expect(submitted).toBe(true);
});
