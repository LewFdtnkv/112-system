import { expect, test } from "@playwright/test";

test("teacher queues a parameterized package and reviews real worker output", async ({
  page,
  request,
}, info) => {
  const templateOnly = process.env.GENERATION_TEMPLATE_ONLY === "true";
  const fallbackTest = process.env.GENERATION_FALLBACK_TEST === "true";
  test.skip(
    process.env.AUTH_ISOLATED_API !== "true" ||
      (!templateOnly && !fallbackTest && process.env.LLM_REAL_TEST !== "true"),
    "Disposable database and real LLM worker required",
  );
  test.setTimeout(600000);
  await page.setViewportSize({ width: 1600, height: 1100 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const call = async (path: string, token = "", data?: unknown) => {
    const response = await request.fetch(`/api/v1/${path}`, {
      method: data === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}` },
      data,
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  let auth = await request.post("/api/v1/auth/login", {
    data: { username: "admin", password: "isolated-admin-password-2026" },
  });
  if (auth.status() === 401) {
    const first = await call("auth/login", "", {
      username: "admin",
      password: "admin",
    });
    auth = await request.post("/api/v1/auth/change-password", {
      headers: { Authorization: `Bearer ${first.access_token}` },
      data: {
        current_password: "admin",
        new_password: "isolated-admin-password-2026",
      },
    });
  }
  expect(auth.ok()).toBeTruthy();
  const admin = (await auth.json()).access_token;
  const suffix = Date.now();
  const password = "generation-browser-test";
  const teacher = await call("users", admin, {
    username: `generation-${suffix}`,
    initial_password: password,
    role: "teacher",
    first_name: "Александр",
    last_name: "Петров",
  });
  const first = await call("auth/login", "", {
    username: teacher.username,
    password,
  });
  const token = (
    await call("auth/change-password", first.access_token, {
      current_password: password,
      new_password: password + "-final",
    })
  ).access_token;
  const service = await call("admin/services", admin, {
    code: `gen-${suffix}`,
    name: "Учебная пожарно-спасательная служба",
    short_name: "Служба 101",
  });
  const catalog = await call("admin/classifiers", admin, {
    label: `Учебный ЕКП ${suffix}`,
    source_filename: "generation.json",
    entries: [
      {
        code: "FIRE.01",
        name: "Пожар",
        section: "Пожары",
        service_ids: [service.id],
      },
    ],
  });
  await call(`admin/classifiers/${catalog.id}/publish`, admin, {});
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(teacher.username);
  await page.getByLabel("Пароль", { exact: true }).fill(password + "-final");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/teacher$/);
  await page.goto("/cards");
  await page.getByRole("button", { name: "Сгенерировать карточки" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Сгенерировать карточки",
  });
  if (templateOnly) {
    await dialog.getByLabel("Способ подготовки").click();
    await page
      .getByRole("option", { name: "Заготовка без ИИ — быстро" })
      .click();
  }
  await dialog.getByLabel("Количество карточек", { exact: true }).fill("2");
  await dialog
    .getByRole("combobox", { name: "Версия ЕКП", exact: true })
    .fill(catalog.label);
  await page.getByRole("option", { name: catalog.label, exact: true }).click();
  await dialog
    .getByRole("combobox", { name: "Тип происшествия", exact: true })
    .fill("Пожар");
  await page.getByRole("option", { name: "Пожар", exact: true }).click();
  await dialog
    .getByRole("combobox", { name: "Пол заявителя", exact: true })
    .click();
  await page.getByRole("option", { name: "Женский", exact: true }).click();
  await dialog.getByLabel("Возраст заявителя", { exact: true }).fill("35");
  await dialog
    .getByRole("combobox", { name: "Улица", exact: true })
    .fill("улица Ленина");
  await page.getByRole("option", { name: "улица Ленина", exact: true }).click();
  await dialog
    .getByRole("combobox", { name: "Населённый пункт", exact: true })
    .fill("Москва");
  await page.getByRole("option", { name: "Москва", exact: true }).click();
  await dialog
    .getByRole("combobox", { name: "Объект", exact: true })
    .fill("жилой дом");
  await page.getByRole("option", { name: "жилой дом", exact: true }).click();
  await dialog.getByLabel("Способ подготовки").scrollIntoViewIfNeeded();
  await dialog.screenshot({
    path: info.outputPath("generation-form.png"),
    animations: "disabled",
  });
  const registered = page.waitForResponse(
    (r) =>
      r.url().endsWith("/card-generations") && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Запустить генерацию" }).click();
  const jobs = await (await registered).json();
  expect(jobs).toHaveLength(2);
  for (const job of jobs) {
    expect(job.facts["Пол"]).toBe("Женский");
    expect(job.facts["Возраст"]).toBe(35);
    expect(job.address_text).toContain("Москва, улица Ленина");
    expect(job.services).toEqual(["Служба 101"]);
  }
  await expect(dialog).not.toBeVisible();
  const table = page.getByRole("table", { name: "Библиотека карточек" });
  if (!templateOnly && !fallbackTest)
    await expect(table).toContainText(/В очереди|Генерируется/);
  await page.screenshot({
    path: info.outputPath("generation-queue.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.reload();
  if (!templateOnly && !fallbackTest)
    await expect(table).toContainText(/В очереди|Генерируется/);
  await expect
    .poll(
      async () => {
        const current = await call("card-generations", token);
        const states = current.items.filter((j: { id: string }) =>
          jobs.some((original: { id: string }) => original.id === j.id),
        );
        const failure = states.find(
          (j: { status: string }) => j.status === "failed",
        );
        expect(failure, failure?.error).toBeUndefined();
        return states.filter(
          (j: { status: string }) => j.status === "succeeded",
        ).length;
      },
      { timeout: 500000, intervals: [2000, 5000] },
    )
    .toBe(2);
  await expect(
    table.getByRole("button", { name: /Редактировать карточку/ }),
  ).toHaveCount(2, { timeout: 15000 });
  await expect(table).not.toContainText("В очереди");
  await page.screenshot({
    path: info.outputPath("generation-ready.png"),
    fullPage: true,
    animations: "disabled",
  });
  const completed = await call("card-generations", token);
  for (const job of completed.items) {
    const card = await call(`cards/${job.card_template_id}`, token);
    expect(card.caller_message).toContain("улица Ленина");
    expect(card.data.caller_details.age).toBe(35);
    expect(card.recipients[0].service_id).toBe(service.id);
    expect(card.can_edit).toBe(true);
    expect(card.caller_message).not.toContain("Контрольные сведения");
    expect(card.generation_template).toBeTruthy();
    if (templateOnly) expect(card.generation_method).toBe("template");
    if (fallbackTest) expect(card.generation_method).toBe("template-fallback");
  }
  await table.locator(".card-library-title").first().click();
  await expect(page.getByRole("dialog")).toContainText(
    "Проверьте условие и эталонное решение",
  );
  await page.getByRole("dialog").screenshot({
    path: info.outputPath("generation-review.png"),
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
