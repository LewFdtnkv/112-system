import { test, expect } from "./auth-fixture";
import { mockBusiness } from "./business-fixture";

const emptyPage = { items: [], total: 0, offset: 0, limit: 20 };

test("ARM flags toggle, persist and remain visible on small screens", async ({
  page,
}, info) => {
  const fixture = await mockBusiness(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/login");
  await page.getByLabel("Логин").fill("student1");
  await page.getByLabel("Пароль").fill("test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/student$/);
  await page.goto("/student/sessions/lesson");
  await page
    .getByRole("button", { name: "Продолжить заполнение", exact: true })
    .click();
  const bar = page.locator(".arm-victim-bar");
  const victims = bar.getByRole("button", {
    name: "Пострадавшие",
    exact: true,
  });
  await victims.click();
  await expect(victims).toHaveAttribute("aria-pressed", "true");
  await expect(
    bar.getByRole("button", { name: "Указать количество пострадавших" }),
  ).toContainText("?");
  await victims.click();
  await expect(victims).toHaveAttribute("aria-pressed", "false");
  for (const name of [
    "Пострадавшие",
    "Нет на месте/ Отказ от скорой",
    "Нет доступа/ Заблокированные",
    "нет контакта",
    "срыв звонка",
  ]) {
    const button = bar.getByRole("button", { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  // noContact with a known incident is intentionally not a valid final answer;
  // drafts preserve mistakes, so learners can correct them before submission.
  await page
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  await expect
    .poll(() => fixture.currentAttempt().card.data.additional_fields)
    .toMatchObject({
      details: {
        hasVictims: true,
        refusedAmbulance: true,
        blocked: true,
        noContact: true,
        callDropped: true,
      },
    });
  await page.screenshot({
    path: info.outputPath("arm-flags-desktop.png"),
    animations: "disabled",
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Продолжить заполнение", exact: true })
    .click();
  await expect(
    bar.getByRole("button", { name: "срыв звонка", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await bar.scrollIntoViewIfNeeded();
  for (const button of await bar.getByRole("button").all()) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
  await page.screenshot({
    path: info.outputPath("arm-flags-mobile.png"),
    animations: "disabled",
  });
});

test("teacher sets reference flags and generates a silent call without invented facts", async ({
  page,
}, info) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/api/v1/",
      "",
    );
    if (path === "card-generations/options")
      return route.fulfill({
        json: {
          locality: ["Москва"],
          street: ["Учебная улица"],
          house: ["7"],
          object: ["Дом"],
          caller_name: { male: ["Иван"], female: ["Анна"] },
          gender: [],
          time_of_day: [],
          caller_state: [],
          detail_level: [],
          max_count: 10,
        },
      });
    if (path === "card-generations") {
      if (route.request().method() === "POST") {
        submitted = route.request().postDataJSON();
        return route.fulfill({ status: 202, json: [] });
      }
      return route.fulfill({ json: emptyPage });
    }
    if (path === "classifiers")
      return route.fulfill({ json: [{ id: "version", label: "Учебный ЕКП" }] });
    return route.fallback();
  });
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.goto("/login");
  await page.getByLabel("Логин").fill("teacher");
  await page.getByLabel("Пароль").fill("test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/teacher$/);
  await page.goto("/cards");
  await page
    .getByRole("button", { name: "Создать карточку", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Пострадавшие", exact: true })
    .click();
  await page.getByRole("option", { name: "Да", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Срыв звонка", exact: true })
    .click();
  await page.getByRole("option", { name: "Да", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Пострадавшие", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("teacher-reference-flags.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.getByRole("button", { name: "Сгенерировать нейросетью" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Количество карточек", { exact: true }).fill("3");
  await dialog
    .getByRole("combobox", { name: "Улица", exact: true })
    .fill("Учебная улица");
  await page
    .getByRole("option", { name: "Учебная улица", exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: "Пострадавшие", exact: true })
    .click();
  await page.getByRole("option", { name: "Да", exact: true }).click();
  await dialog
    .getByRole("combobox", { name: "Срыв звонка", exact: true })
    .click();
  await page.getByRole("option", { name: "Да", exact: true }).click();
  await dialog
    .getByRole("combobox", { name: "Нет контакта", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("generation-flags.png"),
    animations: "disabled",
  });
  await dialog
    .getByRole("combobox", { name: "Нет контакта", exact: true })
    .click();
  await page.getByRole("option", { name: "Да", exact: true }).click();
  await expect(
    dialog.getByRole("combobox", { name: "Улица", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("combobox", { name: "Пострадавшие", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  await expect(
    dialog.getByRole("combobox", { name: "Срыв звонка", exact: true }),
  ).toContainText("Да");
  await page.screenshot({
    path: info.outputPath("generation-silent-call.png"),
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Запустить генерацию" }).click();
  await expect
    .poll(() => submitted)
    .toMatchObject({
      count: 3,
      parameters: {
        no_contact: true,
        call_dropped: true,
        classifier_entry_id: null,
        service_ids: null,
      },
    });
  expect(
    (submitted!.parameters as Record<string, unknown>).street,
  ).toBeUndefined();
  expect(
    (submitted!.parameters as Record<string, unknown>).has_victims,
  ).toBeUndefined();
});

test("a silent call can be saved without choosing a type or inventing an address", async ({
  page,
}, info) => {
  const fixture = await mockBusiness(page);
  const a = fixture.currentAttempt();
  Object.assign(a, {
    classifier_entry: null,
    recipient_services: [],
    caller_message:
      "После приветствия в трубке тишина. Затем соединение прервалось.",
  });
  Object.assign(a.card, {
    classifier_entry_id: null,
    data: {
      description: "",
      caller_name: "",
      caller_phone: "",
      address_text: "",
      address_details: {},
      additional_fields: {},
    },
  });
  await page.route("**/api/v1/**/classifier-entries*", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/login");
  await page.getByLabel("Логин").fill("student1");
  await page.getByLabel("Пароль").fill("test-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/student$/);
  await page.goto("/student/sessions/lesson");
  await page
    .getByRole("button", { name: "Продолжить заполнение", exact: true })
    .click();
  await page.getByRole("button", { name: "нет контакта", exact: true }).click();
  await page.getByRole("button", { name: "срыв звонка", exact: true }).click();
  await expect(page.getByLabel("Субъект", { exact: true })).toHaveValue("");
  await page
    .getByLabel("Сообщение со слов заявителя", { exact: true })
    .fill("Соединение установлено, в ответ тишина. Затем звонок прервался.");
  await page.screenshot({
    path: info.outputPath("arm-silent-call.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Сохранить без оповещения", exact: true })
    .click();
  await expect.poll(() => fixture.currentAttempt().status).toBe("completed");
  expect(fixture.currentAttempt().card.classifier_entry_id).toBeNull();
  expect(fixture.currentAttempt().card.data.address_text).toBe("");
  expect(fixture.currentAttempt().card.data.additional_fields).toMatchObject({
    details: { noContact: true, callDropped: true },
  });
});
