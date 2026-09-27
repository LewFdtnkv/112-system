import { expect, test } from "@playwright/test";

test("compare four card review layouts and inspect immutable ARM answers", async ({
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
  const student = await makeUser("student");
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
  const nextCard = await call("cards", teacher.token, {
    title: "Пожар в соседнем доме",
    classifier_version_id: classifier.id,
    classifier_entry_id: entry.id,
    caller_message: "Дым из дома 18 на Учебной улице.",
    instructions: "Заполните карточку.",
    data: {
      ...expected,
      address_details: { ...expected.address_details, house: "18" },
    },
    recipient_service_ids: [service.id],
  });
  const scenario = await call("scenarios", teacher.token, {
    title: "Приём сообщения о пожаре",
    role: "operator_112",
    card_ids: [card.id, nextCard.id],
  });
  const group = await call("groups", teacher.token, {
    name: `Разбор карточек ${suffix}`,
  });
  await call(
    `groups/${group.id}/students/${student.id}`,
    teacher.token,
    undefined,
    "PUT",
  );
  const lesson = await call("lessons/start", teacher.token, {
    request_id: crypto.randomUUID(),
    group_id: group.id,
    scenario_version_id: scenario.id,
  });
  const work = await call(`student/lessons/${lesson.id}`, student.token);
  const attempt = await call(
    `student/assignments/${work.assignments[0].id}/start`,
    student.token,
    {},
  );
  const filled = await call(
    `student/attempts/${attempt.id}/card`,
    student.token,
    {
      revision: attempt.card.revision,
      classifier_entry_id: entry.id,
      data: {
        ...expected,
        caller_phone: "",
        address_text: "Москва, Учебная улица, д. 21, кв. 45",
        address_details: {
          ...expected.address_details,
          house: "21",
          building: "",
        },
        description: "Дым из квартиры на пятом этаже. Люди в подъезде.",
        features: {
          victimsCount: 0,
          ekp: { people: true, place: "Квартира", signs: ["Дым"] },
        },
        additional_fields: { operatorAction: "Уточнил наличие пострадавших" },
      },
    },
    "PUT",
  );
  await call(`student/attempts/${attempt.id}/submit`, student.token, {
    revision: filled.card.revision,
  });
  const login = async (username: string) => {
    await page.goto("/login");
    await page.getByLabel("Логин", { exact: true }).fill(username);
    await page.getByLabel("Пароль", { exact: true }).fill(password + "-final");
    await page.getByRole("button", { name: "Войти", exact: true }).click();
  };
  await login(teacher.username);
  await expect(page).toHaveURL(/teacher$/);
  await page.goto(`/results/${lesson.id}?student=${student.id}`);
  const comparison = page.getByRole("region", {
    name: "Разбор карточки 1",
    exact: true,
  });
  await expect(
    comparison.getByRole("heading", {
      name: "Ответ ученика и эталонное решение",
    }),
  ).toBeVisible();
  await expect(
    comparison.getByRole("button", { name: "Таблица", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await comparison.getByRole("button", { name: "Рядом", exact: true }).click();
  const house = comparison
    .locator(".comparison-field")
    .filter({ has: page.getByText("Дом", { exact: true }) });
  await expect(house).toContainText("Расхождение");
  await expect(house.locator(".comparison-actual")).toContainText("21");
  await expect(house.locator(".comparison-expected")).toContainText("12");
  const narrative = comparison
    .locator(".comparison-field")
    .filter({ has: page.getByText("Сообщение в карточке", { exact: true }) });
  await expect(narrative).toContainText("Проверить смысл");
  for (const [label, name] of [
    ["Рядом", "01-paired"],
    ["Блоками", "02-blocks"],
    ["Таблица", "03-table"],
  ]) {
    await comparison.getByRole("button", { name: label, exact: true }).click();
    await comparison.screenshot({
      path: info.outputPath(`${name}.png`),
      animations: "disabled",
    });
  }
  await expect(
    comparison.getByRole("button", { name: "Показать все поля" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(comparison.getByRole("table")).not.toContainText(
    "Анна Смирнова",
  );
  await comparison.getByRole("button", { name: "Показать все поля" }).click();
  await comparison.getByRole("button", { name: "Рядом", exact: true }).click();
  await comparison
    .getByRole("button", { name: "Ответ в АРМ", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: /Карточка происшествия/ });
  await expect(dialog.getByLabel("Дом/Вл", { exact: true })).toHaveValue("21");
  await expect(dialog.getByLabel("Дом/Вл", { exact: true })).toBeDisabled();
  await expect(
    dialog.getByLabel("Дом/Вл", { exact: true }).locator(".."),
  ).toHaveAttribute("data-feedback", "error");
  await expect(
    dialog.getByLabel("Улица", { exact: true }).locator(".."),
  ).toHaveAttribute("data-feedback", "success");
  await expect(
    dialog.getByRole("button", { name: "Оповестить и сохранить карточку" }),
  ).toHaveCount(0);
  await dialog.screenshot({
    path: info.outputPath("04-arm-answer.png"),
    animations: "disabled",
  });
  await expect(
    dialog.getByRole("button", { name: "← Предыдущая карточка", exact: true }),
  ).toBeDisabled();
  await dialog.locator(".arm-service-tile").click();
  await expect(
    dialog.getByRole("region", { name: "Сведения о службе" }),
  ).toContainText(service.name);
  await dialog
    .getByRole("button", { name: "Закрыть сведения о службе" })
    .click();
  await dialog
    .getByRole("button", { name: "Эталонное решение", exact: true })
    .click();
  await expect(dialog.getByLabel("Дом/Вл", { exact: true })).toHaveValue("12");
  await dialog.screenshot({
    path: info.outputPath("05-arm-reference.png"),
    animations: "disabled",
  });
  await dialog
    .getByRole("button", { name: "Следующая карточка →", exact: true })
    .click();
  await expect(
    dialog.getByText("Карточка 2 из 2 · Пожар в соседнем доме", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Дом/Вл", { exact: true })).toHaveValue("18");
  await expect(
    dialog.getByRole("button", { name: "Следующая карточка →", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Ответ ученика", exact: true })
    .click();
  await expect(
    dialog.getByText("Ученик ещё не начал карточку. Ответ отсутствует."),
  ).toBeVisible();
  await expect(dialog.getByLabel("Дом/Вл", { exact: true })).toHaveValue("");
  await dialog
    .getByRole("button", { name: "← Предыдущая карточка", exact: true })
    .click();
  await expect(dialog.getByLabel("Дом/Вл", { exact: true })).toHaveValue("21");
  await dialog.getByRole("button", { name: "Вернуться к разбору" }).click();
  await page.setViewportSize({ width: 768, height: 1024 });
  await comparison.screenshot({
    path: info.outputPath("06-paired-tablet.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/cards");
  await page
    .getByRole("button", { name: "Дым из квартиры", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Эталонное решение", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog").locator("dl")).toContainText(
    "Угроза людям",
  );
  await page.getByRole("dialog").screenshot({
    path: info.outputPath("07-template-view.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page
    .getByRole("button", { name: "Создать карточку", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Название карточки", exact: true })
    .fill("Учебный пожар");
  await page.getByLabel("Сообщение заявителя").fill(card.caller_message);
  await page.getByLabel("Общая инструкция ученику").fill(card.instructions);
  await page
    .getByLabel("ФИО заявителя", { exact: true })
    .fill(expected.caller_name);
  await page
    .getByLabel("Телефон заявителя", { exact: true })
    .fill(expected.caller_phone);
  await page
    .getByRole("textbox", { name: "Сообщение в карточке", exact: true })
    .fill(expected.description);
  await page.getByLabel("Улица", { exact: true }).fill("Учебная улица");
  await page.getByLabel("Дом", { exact: true }).fill("12");
  await page
    .getByRole("combobox", { name: "Опубликованная версия ЕКП", exact: true })
    .fill(classifier.label);
  await page
    .getByRole("option")
    .filter({ hasText: classifier.label })
    .first()
    .click();
  await page
    .getByRole("combobox", { name: "Тип происшествия (ЕКП)", exact: true })
    .fill("Пожар");
  await page
    .getByRole("option")
    .filter({ hasText: "Пожар в жилом доме" })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Угроза людям: Да", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Место пожара: Квартира", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Признаки пожара: Дым", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Признаки пожара: Запах гари", exact: true })
    .click();

  await page.setViewportSize({ width: 1600, height: 1700 });
  await page
    .getByRole("dialog")
    .locator(".MuiDialogContent-root")
    .evaluate((el) => {
      el.scrollTop = 0;
    });
  await page.getByRole("dialog").screenshot({
    path: info.outputPath("08-template-editor.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await login(student.username);
  await expect(page).toHaveURL(/student$/);
  await page.goto(`/results/${lesson.id}`);
  await expect(
    page.getByText("Эталонное решение", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Карточки занятия" }).click();
  await page
    .getByRole("button", {
      name: `Открыть карточку ${attempt.card.display_number}`,
      exact: true,
    })
    .click();
  await expect(dialog.getByLabel("Дом/Вл", { exact: true })).toHaveValue("21");
  await expect(dialog.getByLabel("Дом/Вл", { exact: true })).toBeDisabled();
  await expect(dialog.locator("[data-feedback]")).toHaveCount(0);
  await expect(
    dialog.getByText("Эталонное решение", { exact: true }),
  ).toHaveCount(0);
  await dialog.screenshot({
    path: info.outputPath("09-student-card.png"),
    animations: "disabled",
  });
  const studentAttempt = await call(
    `student/attempts/${attempt.id}`,
    student.token,
  );
  expect(studentAttempt.card.data.address_details.house).toBe("21");
  expect(studentAttempt.card.revision).toBe(filled.card.revision + 1);
  expect(errors).toEqual([]);
});
