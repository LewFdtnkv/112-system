import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it } from "vitest";

import { useDemoScenarioStore } from "@/entities/scenario";
import { useDemoTrainingStore } from "@/entities/training-session";
import { useAuthStore, type DemoUserRole } from "@/entities/user";

import { AppProviders } from "../providers/AppProviders";
import { routes } from "./routes";

afterEach(() => {
  cleanup();
  useDemoScenarioStore.setState(useDemoScenarioStore.getInitialState());
  useDemoTrainingStore.getState().reset();
  useAuthStore.getState().clearSession();
  localStorage.clear();
});

const signIn = (role: DemoUserRole) =>
  useAuthStore
    .getState()
    .setSession({ userId: `demo-${role}-1`, roles: [role] });

const renderPage = (path: string) => {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
};

it("validates, creates and edits a scenario through the routed pages", async () => {
  const user = userEvent.setup();
  signIn("teacher");
  const router = renderPage("/scenarios/new");
  const initialCount = useDemoScenarioStore.getState().scenarios.length;

  await user.click(await screen.findByRole("button", { name: "Сохранить" }));
  expect(
    await screen.findByText("Введите не менее трёх символов"),
  ).toBeVisible();
  expect(useDemoScenarioStore.getState().scenarios).toHaveLength(initialCount);

  await user.type(
    screen.getByRole("textbox", { name: "Название" }),
    "Тестовый сценарий",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Категория" }),
    "Учебная категория",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Описание" }),
    "Учебное обращение для проверки редактора.",
  );
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByRole("table", { name: "Сценарии" })).toBeVisible();
  expect(router.state.location.pathname).toBe("/scenarios");
  expect(useDemoScenarioStore.getState().scenarios).toHaveLength(
    initialCount + 1,
  );

  await user.click(screen.getByRole("link", { name: "Тестовый сценарий" }));
  const nameInput = await screen.findByRole("textbox", { name: "Название" });
  expect(nameInput).toHaveValue("Тестовый сценарий");
  await user.clear(nameInput);
  await user.type(nameInput, "Изменённый сценарий");
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(
    await screen.findByRole("link", { name: "Изменённый сценарий" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Тестовый сценарий" }),
  ).not.toBeInTheDocument();
  expect(useDemoScenarioStore.getState().scenarios).toHaveLength(
    initialCount + 1,
  );
});

it("keeps the scenario norm in seconds editable and stored", async () => {
  const user = userEvent.setup();
  signIn("teacher");
  renderPage("/scenarios/demo-scenario-1/edit");

  const norm = await screen.findByRole("spinbutton", {
    name: "Норматив заполнения карточки, с",
  });
  expect(norm).toHaveValue(30);

  await user.clear(norm);
  await user.type(norm, "45");
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  const saved = useDemoScenarioStore
    .getState()
    .scenarios.find((scenario) => scenario.id === "demo-scenario-1");
  expect(saved?.normSeconds).toBe(45);
});

it("opens a student's completed session and its matching result", async () => {
  const user = userEvent.setup();
  signIn("teacher");
  const router = renderPage("/training/demo-session-3");

  expect(
    await screen.findByRole("heading", { level: 1, name: "Учебное занятие" }),
  ).toBeVisible();
  await user.click(screen.getByRole("link", { name: "Открыть результат" }));

  expect(await screen.findByText("Итог: 92 / 100 (92%)")).toBeVisible();
  expect(router.state.location.pathname).toBe("/results/demo-session-3");
  expect(screen.getByText("Анна Смирнова")).toBeVisible();
  await user.click(screen.getByRole("link", { name: "Открыть занятие" }));
  expect(router.state.location.pathname).toBe("/training/demo-session-3");
});

it("opens an assigned student session in the ARM workspace route", async () => {
  signIn("student");
  renderPage("/student/sessions/demo-session-1");

  expect(
    await screen.findByRole("heading", { name: "Поиск происшествий" }),
  ).toBeVisible();
  expect(
    screen.getByRole("table", { name: "Список происшествий" }),
  ).toBeVisible();
});

it.each([
  {
    role: "student" as const,
    path: "/student",
    table: "Мои занятия",
    destination: "/student/sessions/demo-session-1",
  },
  {
    role: "teacher" as const,
    path: "/teacher",
    table: "Занятия преподавателя",
    destination: "/training/demo-session-1",
  },
  {
    role: "teacher" as const,
    path: "/training",
    table: "Учебные занятия",
    destination: "/training/demo-session-1",
  },
])(
  "opens a permitted session page for $role",
  async ({ role, path, table, destination }) => {
    const user = userEvent.setup();
    signIn(role);
    const router = renderPage(path);
    const sessions = await screen.findByRole("table", { name: table });
    await user.click(within(sessions).getAllByRole("link")[0]);
    expect(router.state.location.pathname).toBe(destination);
    expect(
      await screen.findByRole("heading", {
        name: role === "student" ? "Поиск происшествий" : "Учебное занятие",
      }),
    ).toBeVisible();
  },
);

it("shows the signed-in student's records and only permitted navigation", async () => {
  useAuthStore
    .getState()
    .setSession({ userId: "demo-student-2", roles: ["student"] });
  renderPage("/student");
  const sessions = await screen.findByRole("table", { name: "Мои занятия" });
  expect(within(sessions).getByText("Илья Волков")).toBeVisible();
  expect(within(sessions).queryByText("Анна Смирнова")).not.toBeInTheDocument();
  const navigation = screen.getByRole("navigation", {
    name: "Разделы тренажёра",
  });
  expect(
    within(navigation).getByRole("link", { name: "Результаты" }),
  ).toBeVisible();
  expect(
    within(navigation).queryByRole("link", { name: "Пользователи" }),
  ).not.toBeInTheDocument();
  expect(
    within(navigation).queryByRole("link", { name: "Кабинет преподавателя" }),
  ).not.toBeInTheDocument();
});

it("opens a student's completed session as a result without forbidden staff links", async () => {
  const user = userEvent.setup();
  signIn("student");
  const router = renderPage("/student");
  const sessions = await screen.findByRole("table", {
    name: "Завершённые занятия ученика",
  });
  await user.click(within(sessions).getAllByRole("link")[0]);
  expect(await screen.findByText("Итог: 92 / 100 (92%)")).toBeVisible();
  expect(router.state.location.pathname).toBe("/results/demo-session-3");
  expect(
    screen.queryByRole("link", { name: "Открыть занятие" }),
  ).not.toBeInTheDocument();
});

it("lists only the student's own results", async () => {
  signIn("student");
  renderPage("/results");
  const results = await screen.findByRole("table", {
    name: "Результаты занятий",
  });
  expect(within(results).getByText("Анна Смирнова")).toBeVisible();
  expect(within(results).queryByText("Илья Волков")).not.toBeInTheDocument();
});

it("does not expose another student's result through a direct URL", async () => {
  signIn("student");
  renderPage("/results/demo-session-4");
  expect(await screen.findByText("Занятие не найдено")).toBeVisible();
  expect(screen.queryByText(/Итог:/)).not.toBeInTheDocument();
});

it("uses the same score in the session list and result details", async () => {
  const user = userEvent.setup();
  signIn("teacher");
  renderPage("/results");
  const results = await screen.findByRole("table", {
    name: "Результаты занятий",
  });
  const resultLink = within(results).getByRole("link", {
    name: /Результат:.*Илья Волков/,
  });
  expect(resultLink).toHaveTextContent("72 / 100 (72%)");
  await user.click(resultLink);
  expect(await screen.findByText("Итог: 72 / 100 (72%)")).toBeVisible();
});

it("sends anonymous visitors of a guarded route to the login page", async () => {
  const router = renderPage("/scenarios");

  expect(await screen.findByLabelText("Логин")).toBeVisible();
  expect(router.state.location.pathname).toBe("/login");
});

it.each([
  { path: "/admin", role: "student" as const },
  { path: "/users", role: "teacher" as const },
  { path: "/scenarios", role: "student" as const },
  { path: "/student/sessions/demo-session-1", role: "teacher" as const },
])("denies $path to the $role role", async ({ path, role }) => {
  signIn(role);
  const router = renderPage(path);

  expect(await screen.findByText(/Доступ запрещён/)).toBeVisible();
  expect(router.state.location.pathname).toBe("/403");
});

it.each([
  { path: "/scenarios/missing/edit", message: "Сценарий не найден" },
  { path: "/training/missing", message: "Занятие не найдено" },
  { path: "/results/missing", message: "Занятие не найдено" },
  { path: "/results/demo-session-1", message: "Результат ещё не сформирован" },
])("handles unavailable data at $path", async ({ path, message }) => {
  signIn("teacher");
  renderPage(path);
  expect(await screen.findByText(message)).toBeVisible();
});
