import { expect, test } from "@playwright/test";

test("card library columns, unused card editing and stale-write protection", async ({
  page,
  request,
}, info) => {
  test.skip(
    process.env.AUTH_ISOLATED_API !== "true",
    "Disposable database required",
  );
  test.setTimeout(90000);
  page.setDefaultTimeout(10000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const call = async (
    path: string,
    token = "",
    data?: unknown,
    method?: string,
  ) => {
    const response = await request.fetch(`/api/v1/${path}`, {
      method: method ?? (data === undefined ? "GET" : "POST"),
      headers: { Authorization: `Bearer ${token}` },
      data,
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.status() === 204 ? null : response.json();
  };
  const admin = (
    await call("auth/login", "", {
      username: "admin",
      password: "isolated-admin-password-2026",
    })
  ).access_token;
  const suffix = Date.now();
  const password = "card-review-browser-test";
  const makeUser = async (role: string) => {
    const user = await call("users", admin, {
      username: `${role}-review-${suffix}`,
      initial_password: password,
      role,
      first_name: "Александр",
      last_name: "Иванов",
    });
    const login = await call("auth/login", "", {
      username: user.username,
      password,
    });
    const auth = await call("auth/change-password", login.access_token, {
      current_password: password,
      new_password: password + "-final",
    });
    return { ...user, token: auth.access_token };
  };
  const teacher = await makeUser("teacher");
  await makeUser("student");
  const service = await call("admin/services", admin, {
    code: `review${suffix}`,
    short_name: "Служба 101",
    name: "Учебная пожарно-спасательная часть Центрального округа",
  });
  const features = [
    { key: "people", label: "Угроза людям", type: "boolean", required: true },
    {
      key: "place",
      label: "Место пожара",
      type: "choice",
      options: ["Квартира", "Улица"],
      required: false,
    },
    {
      key: "signs",
      label: "Признаки пожара",
      type: "array",
      options: ["Дым", "Запах гари", "Открытое пламя"],
      required: false,
    },
  ];
  const classifier = await call("admin/classifiers/import", admin, {
    format: "system112-ekp-v1",
    services: [
      {
        code: service.code,
        name: service.name,
        short_name: service.short_name,
      },
    ],
    label: `Разбор ${suffix}`,
    entries: [
      {
        code: "REVIEW.01",
        section: "Учебные",
        name: "Пожар в жилом доме",
        display_name: "Пожар",
        features,
        routes: [{ service_code: service.code, is_main: true, when: {} }],
      },
    ],
  });
  await call(`admin/classifiers/${classifier.id}/publish`, admin, {});
  const entry = (
    await call(`classifiers/${classifier.id}/entries`, teacher.token)
  )[0];
  const expected = {
    caller_name: "Анна Смирнова",
    caller_phone: "+7 999 123-45-67",
    address_text: "Москва, Учебная улица, д. 12, корп. 2, кв. 45",
    address_details: {
      locality: "Москва",
      street: "Учебная улица",
      house: "12",
      building: "2",
      apartment: "45",
      floor: "5",
    },
    description:
      "Из квартиры 45 на пятом этаже идёт дым. В подъезде запах гари, на лестнице находятся люди.",
    features: {
      victimsCount: 0,
      ekp: { people: true, place: "Квартира", signs: ["Дым", "Запах гари"] },
    },
    additional_fields: {},
  };
  const card = await call("cards", teacher.token, {
    title: "Дым из квартиры",
    classifier_version_id: classifier.id,
    classifier_entry_id: entry.id,
    caller_message:
      "Я Анна Смирнова. Москва, Учебная улица, дом 12, корпус 2, квартира 45, пятый этаж. Идёт дым, пахнет гарью. На лестнице люди, никто не пострадал. Мой телефон +7 999 123-45-67.",
    instructions:
      "Заполните карточку и оповестите пожарно-спасательную службу.",
    data: expected,
    recipient_service_ids: [service.id],
  });
  expect(card.classifier_entry.id).toBe(entry.id);
  expect(card.recipients[0].name).toBe(service.name);
  const draft = await call("cards", teacher.token, {
    title:
      "Пожар с задымлением на пятом этаже — учебная карточка для уточнения адреса",
    classifier_version_id: classifier.id,
    classifier_entry_id: entry.id,
    caller_message: card.caller_message,
    instructions: card.instructions,
    recipient_service_ids: [service.id],
    data: {
      ...expected,
      caller_details: {
        gender: "Женский",
        age: 0,
        provided: "+7 999 123-45-67",
        custom_note: "Не терять",
      },
      additional_fields: {
        location: { latitude: 55.75, longitude: 37.61 },
        custom_data: { source: "test" },
      },
      victim_details: "Сведения сохранены",
    },
  });
  await call("scenarios", teacher.token, {
    title: "Использованная карточка",
    role: "operator_112",
    card_ids: [card.id],
  });
  await page.goto("/login");
  await page.getByLabel("Логин", { exact: true }).fill(teacher.username);
  await page.getByLabel("Пароль", { exact: true }).fill(password + "-final");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/teacher$/);
  await page.goto("/cards");
  const table = page.getByRole("table", { name: "Библиотека карточек" });
  for (const name of [
    "Название",
    "Тип происшествия",
    "Адрес",
    "Службы",
    "В сценариях",
    "Изменена",
    "Действия",
  ]) {
    await expect(
      table.getByRole("columnheader", { name, exact: true }),
    ).toBeVisible();
  }
  const used = table.getByRole("row").filter({
    has: page.getByRole("button", { name: card.title, exact: true }),
  });
  await expect(
    used.getByRole("button", {
      name: `Редактировать карточку «${card.title}»`,
    }),
  ).toBeDisabled();
  await expect(used).toContainText("Используется · только просмотр");
  await expect(table).toContainText("Учебная улица");
  await page.screenshot({
    path: info.outputPath("library-table.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Поиск карточки", { exact: true })
    .fill("такой карточки нет");
  await expect(table).toContainText("Карточки не найдены");
  await page.getByLabel("Поиск карточки", { exact: true }).fill("");
  await page
    .getByRole("button", { name: `Редактировать карточку «${draft.title}»` })
    .click();
  const editor = page.getByRole("dialog", { name: "Редактирование карточки" });
  await expect(editor.getByLabel("ФИО заявителя", { exact: true })).toHaveValue(
    expected.caller_name,
  );
  await expect(
    editor.getByLabel("Количество пострадавших", { exact: true }),
  ).toHaveValue("0");
  await expect(editor.getByLabel("Возраст", { exact: true })).toHaveValue("0");
  await expect(
    editor.getByRole("button", { name: "Угроза людям: Да", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await editor
    .getByRole("textbox", { name: "Название карточки", exact: true })
    .fill("Уточнённая карточка пожара");
  await editor.getByLabel("Дом", { exact: true }).fill("18");
  await page.setViewportSize({ width: 1600, height: 1750 });
  await editor.locator(".MuiDialogContent-root").evaluate((el) => {
    el.scrollTop = 0;
  });
  await editor.screenshot({ path: info.outputPath("library-editor.png") });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await editor
    .getByRole("button", { name: "Сохранить изменения", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  const updated = await call(`cards/${draft.id}`, teacher.token);
  expect(updated.title).toBe("Уточнённая карточка пожара");
  expect(updated.revision).toBe(2);
  expect(updated.data.address_details.house).toBe("18");
  expect(updated.data.features).toEqual(expected.features);
  expect(updated.data.additional_fields).toEqual(draft.data.additional_fields);
  expect(updated.data.victim_details).toBe(draft.data.victim_details);
  expect(updated.data.caller_details.custom_note).toBe("Не терять");
  expect(updated.data.caller_details.provided).toBe("+7 999 123-45-67");
  const rows = await call("views/cards", teacher.token);
  expect(rows.total).toBe(2);
  await page
    .getByRole("button", { name: `Редактировать карточку «${updated.title}»` })
    .click();
  await editor
    .getByRole("textbox", { name: "Название карточки", exact: true })
    .fill("Несохранённый ввод");
  await call(
    `cards/${draft.id}`,
    teacher.token,
    {
      title: "Изменено в другом окне",
      revision: updated.revision,
      classifier_version_id: updated.classifier_version_id,
      classifier_entry_id: updated.classifier_entry_id,
      caller_message: null,
      instructions: updated.instructions,
      data: updated.data,
      recipient_service_ids: updated.recipient_service_ids,
      use_recommended_recipients: false,
    },
    "PUT",
  );
  await editor
    .getByRole("button", { name: "Сохранить изменения", exact: true })
    .click();
  await expect(
    editor.getByRole("alert").filter({ hasText: "изменена в другом окне" }),
  ).toBeVisible();
  await expect(
    editor.getByRole("textbox", { name: "Название карточки", exact: true }),
  ).toHaveValue("Несохранённый ввод");
  await editor
    .getByRole("button", { name: "Загрузить актуальную карточку" })
    .click();
  await expect(
    editor.getByRole("textbox", { name: "Название карточки", exact: true }),
  ).toHaveValue("Изменено в другом окне");
  await expect(
    editor.getByLabel("Сообщение заявителя"),
  ).toHaveValue("");
  await editor
    .getByRole("button", { name: "Сохранить изменения", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  expect(
    (await call(`cards/${draft.id}`, teacher.token)).caller_message,
  ).toBeNull();
  await page.getByRole("button", { name: card.title, exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Редактировать карточку", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
