import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { cardDraftStorageKey } from "@/entities/incident-card";
import { useDemoTrainingStore } from "@/entities/training-session";
import { useAuthStore } from "@/entities/user";

import { TrainingWorkspacePage } from "./TrainingWorkspacePage";

beforeEach(() => {
  useAuthStore
    .getState()
    .setSession({ userId: "demo-student-1", roles: ["student"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useDemoTrainingStore.getState().reset();
  useAuthStore.getState().clearSession();
  localStorage.clear();
});

const renderWorkspace = (path = "/student/sessions/demo-session-1") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/student/sessions/:sessionId"
          element={<TrainingWorkspacePage />}
        />
      </Routes>
    </MemoryRouter>,
  );

const acceptIncomingCall = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "Принять" }));
};

it("filters, resets and creates incident cards", async () => {
  const user = userEvent.setup();
  renderWorkspace();

  await user.type(
    screen.getByRole("textbox", { name: "Тип происшествия" }),
    "пожар",
  );
  await user.click(
    screen.getByRole("button", { name: "Искать по параметрам" }),
  );

  const table = screen.getByRole("table", { name: "Список происшествий" });
  expect(within(table).getByText("Пожар")).toBeVisible();
  expect(within(table).queryByText("ДТП")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Сбросить" }));
  expect(within(table).getByText("ДТП")).toBeVisible();

  await acceptIncomingCall(user);

  await user.click(
    screen.getByRole("button", { name: "Создать новую карточку" }),
  );
  await user.click(screen.getByRole("button", { name: "Создать" }));

  expect(
    await screen.findByRole("heading", { name: /Карточка происшествия/ }),
  ).toBeVisible();
});

it("records operator actions in the card log", async () => {
  const user = userEvent.setup();
  renderWorkspace();

  await acceptIncomingCall(user);

  await user.click(
    screen.getByRole("button", { name: "Открыть карточку 378879302" }),
  );

  const dialog = await screen.findByRole("dialog");
  await user.type(
    within(dialog).getByRole("textbox", { name: "Действие оператора" }),
    "Сообщение принято, дежурная бригада направлена на место",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Зафиксировать действие" }),
  );

  expect(
    within(dialog).getByText(
      "Оператор: Сообщение принято, дежурная бригада направлена на место",
    ),
  ).toBeVisible();
});

it("blocks submission until the required fields are filled", async () => {
  const user = userEvent.setup();
  renderWorkspace();

  await acceptIncomingCall(user);

  await user.click(
    screen.getByRole("button", { name: "Открыть карточку 378879302" }),
  );
  const dialog = await screen.findByRole("dialog");
  await user.clear(within(dialog).getByRole("textbox", { name: "Дом/Вл" }));
  await user.click(
    within(dialog).getByRole("button", { name: "Отправить на проверку" }),
  );

  expect(within(dialog).getByRole("alert")).toHaveTextContent(
    /действие оператора/,
  );
  expect(within(dialog).getByRole("alert")).toHaveTextContent(
    /службы реагирования/,
  );
  expect(within(dialog).getByRole("alert")).toHaveTextContent(
    "адрес (улица и дом)",
  );

  await user.type(
    within(dialog).getByRole("textbox", { name: "Дом/Вл" }),
    "12",
  );
  await user.type(
    within(dialog).getByRole("textbox", { name: "Действие оператора" }),
    "Вызов принят",
  );
  await user.click(within(dialog).getByRole("button", { name: "103" }));
  await user.click(
    within(dialog).getByRole("button", { name: "Отправить на проверку" }),
  );

  expect(
    within(dialog).getByText("Карточка передана на учебную проверку."),
  ).toBeVisible();
  expect(
    localStorage.getItem(cardDraftStorageKey("demo-session-1", "378879302")),
  ).toBeNull();
  expect(
    within(dialog).getByRole("button", { name: "Отправить на проверку" }),
  ).toBeDisabled();
  expect(within(dialog).getByRole("textbox", { name: "Улица" })).toBeDisabled();
  expect(
    within(dialog).getByRole("combobox", { name: "Статус обработки" }),
  ).toHaveTextContent("Завершено");
  await user.click(within(dialog).getByRole("button", { name: "Закрыть" }));
  await user.click(
    await screen.findByRole("button", { name: "Открыть карточку 378879302" }),
  );
  expect(
    localStorage.getItem(cardDraftStorageKey("demo-session-1", "378879302")),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Отправить на проверку" }),
  ).toBeDisabled();
});

it("restores an unfinished card from the local draft", async () => {
  const user = userEvent.setup();
  localStorage.setItem(
    cardDraftStorageKey("demo-session-1"),
    JSON.stringify({
      cardId: "378879302",
      fields: {
        categoryId: "traffic",
        address: "г. Москва, восстановленный адрес",
        district: "ЮАО",
        callerName: "",
        callerPhone: "+7 900 123-45-67",
        victimsCount: null,
        description: "Черновик после обрыва связи.",
        operatorAction: "",
        services: ["102"],
        status: "in_progress",
      },
      savedAt: new Date().toISOString(),
    }),
  );

  renderWorkspace();
  await user.click(
    screen.getByRole("button", { name: "Открыть карточку 378879302" }),
  );

  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByRole("textbox", { name: "Описательный адрес" }),
  ).toHaveValue("г. Москва, восстановленный адрес");
  expect(within(dialog).getByRole("textbox", { name: "Округ" })).toHaveValue(
    "ЮАО",
  );
  expect(
    within(dialog).getByRole("textbox", { name: "Предоставленный" }),
  ).toHaveValue("+7 900 123-45-67");
});

it("keeps separate drafts when switching cards and remounting the workspace", async () => {
  const user = userEvent.setup();
  const view = renderWorkspace();

  await acceptIncomingCall(user);
  const editAddress = async (cardId: string, address: string) => {
    await user.click(
      await screen.findByRole("button", { name: `Открыть карточку ${cardId}` }),
    );
    const input = screen.getByRole("textbox", { name: "Улица" });
    await user.clear(input);
    await user.type(input, address);
    await user.click(screen.getByRole("button", { name: "Закрыть" }));
  };

  await editAddress("378879302", "Первый адрес");
  const secondCard = (
    await screen.findAllByRole("button", { name: /Открыть карточку / })
  ).find(
    (button) =>
      button.getAttribute("aria-label") !== "Открыть карточку 378879302",
  )!;
  const secondId = secondCard
    .getAttribute("aria-label")!
    .replace("Открыть карточку ", "");
  await editAddress(secondId, "Второй адрес");
  view.unmount();
  renderWorkspace();

  await user.click(
    screen.getByRole("button", { name: "Открыть карточку 378879302" }),
  );
  expect(screen.getByRole("textbox", { name: "Улица" })).toHaveValue(
    "Первый адрес",
  );
  expect(screen.getByRole("textbox", { name: "Дом/Вл" })).toHaveValue("12");
  expect(screen.getByRole("textbox", { name: "Предоставленный" })).toHaveValue(
    "+7 900 000-00-01",
  );
  await user.click(screen.getByRole("button", { name: "Закрыть" }));
  await user.click(
    await screen.findByRole("button", { name: `Открыть карточку ${secondId}` }),
  );
  expect(screen.getByRole("textbox", { name: "Улица" })).toHaveValue(
    "Второй адрес",
  );
});

it("shows the running call timer and scenario norm inside the card", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const user = userEvent.setup();
  renderWorkspace();

  await acceptIncomingCall(user);
  await user.click(
    screen.getByRole("button", { name: "Открыть карточку 378879302" }),
  );

  const timer = screen.getByLabelText(
    "Время заполнения карточки относительно норматива",
  );
  expect(timer).toHaveTextContent("00:00 / 00:30");
  expect(screen.queryByText("Норматив превышен")).not.toBeInTheDocument();

  act(() => vi.advanceTimersByTime(31_000));
  expect(timer).toHaveTextContent("00:31 / 00:30");
  expect(screen.getByText("Норматив превышен")).toBeVisible();
});

it("allows submission after the operator action has already been recorded", async () => {
  const user = userEvent.setup();
  renderWorkspace();
  await acceptIncomingCall(user);
  await user.click(
    screen.getByRole("button", { name: "Открыть карточку 378879302" }),
  );
  await user.type(
    screen.getByRole("textbox", { name: "Действие оператора" }),
    "Вызов принят",
  );
  await user.click(
    screen.getByRole("button", { name: "Зафиксировать действие" }),
  );
  await user.click(screen.getByRole("button", { name: "103" }));
  await user.click(
    screen.getByRole("button", { name: "Отправить на проверку" }),
  );
  expect(
    screen.getByText("Карточка передана на учебную проверку."),
  ).toBeVisible();
});

it("completes the training and creates a result after a submitted card", async () => {
  const user = userEvent.setup();
  renderWorkspace();
  await acceptIncomingCall(user);
  await user.click(
    screen.getByRole("button", { name: "Открыть карточку 378879302" }),
  );
  await user.type(
    screen.getByRole("textbox", { name: "Действие оператора" }),
    "Вызов принят",
  );
  await user.click(
    screen.getByRole("button", { name: "Зафиксировать действие" }),
  );
  await user.click(screen.getByRole("button", { name: "103" }));
  await user.click(
    screen.getByRole("button", { name: "Отправить на проверку" }),
  );
  await user.click(screen.getByRole("button", { name: "Закрыть" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Завершить занятие" }));

  expect(
    useDemoTrainingStore
      .getState()
      .sessions.find((session) => session.id === "demo-session-1")?.status,
  ).toBe("completed");
  expect(
    useDemoTrainingStore
      .getState()
      .evaluations.find(
        (evaluation) => evaluation.sessionId === "demo-session-1",
      ),
  ).toMatchObject({ maxScore: 100, source: "auto" });
});

it.each([
  { id: "missing", message: "Занятие не найдено" },
  { id: "demo-session-2", message: "Занятие не найдено" },
  { id: "demo-session-3", message: "Занятие завершено" },
])("does not start an unavailable workspace for $id", ({ id, message }) => {
  renderWorkspace(`/student/sessions/${id}`);
  expect(screen.getByText(message)).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Принять" }),
  ).not.toBeInTheDocument();
});
