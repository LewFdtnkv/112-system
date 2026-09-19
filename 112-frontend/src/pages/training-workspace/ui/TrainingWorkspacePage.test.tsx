import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  trainingApi,
  type Attempt,
  type StudentLesson,
} from "@/entities/training";
import { TrainingWorkspacePage } from "./TrainingWorkspacePage";
const initial: Attempt = {
  id: "attempt",
  assignment_id: "assignment",
  status: "in_progress",
  started_at: "2026-09-19T10:00:00Z",
  ended_at: null,
  instructions: "Заполните карточку",
  caller_message: "На Учебной улице дым",
  time_limit_seconds: null,
  norm_seconds: 60,
  card: {
    id: "card",
    revision: 3,
    classifier_version_id: "version",
    classifier_entry_id: null,
    status: "draft",
    data: {
      description: "Серверный черновик",
      address_text: "Учебная улица, 7",
      additional_fields: {},
    },
    opened_at: null,
    saved_at: null,
  },
  classifier_entry: null,
  notified_services: [],
  recipient_services: [],
  recipient_error: null,
};
const lesson: StudentLesson = {
  id: "lesson",
  title: "Реальное занятие",
  status: "active",
  work_status: "in_progress",
  started_at: null,
  ended_at: null,
  assignments: [
    {
      id: "assignment",
      position: 1,
      title: "Карточка",
      role: "operator_112",
      available: true,
      attempt_id: "attempt",
      status: "in_progress",
      card: null,
    },
  ],
};
beforeEach(() => {
  vi.spyOn(trainingApi, "studentLesson").mockResolvedValue(lesson);
  vi.spyOn(trainingApi, "attempt").mockResolvedValue(structuredClone(initial));
  vi.spyOn(trainingApi, "attemptEntries").mockResolvedValue([]);
  vi.spyOn(trainingApi, "recipients").mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});
function open() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: "/student/sessions/:sessionId",
        Component: TrainingWorkspacePage,
      },
    ],
    { initialEntries: ["/student/sessions/lesson"] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return client;
}
it("restores server fields and ignores prototype localStorage", async () => {
  localStorage.setItem(
    "dds112-card-draft:lesson",
    JSON.stringify({ description: "Чужой старый черновик" }),
  );
  open();
  await userEvent.click(
    await screen.findByRole("button", { name: "Продолжить заполнение" }),
  );
  const card = await screen.findByRole("dialog");
  expect(
    within(card).getByLabelText("Сообщение со слов заявителя", { exact: true }),
  ).toHaveValue("Серверный черновик");
  expect(within(card).getByText(/На Учебной улице дым/)).toBeVisible();
});
it("keeps entered values when saving fails", async () => {
  vi.spyOn(trainingApi, "saveDraft").mockRejectedValue(new Error("offline"));
  open();
  await userEvent.click(
    await screen.findByRole("button", { name: "Продолжить заполнение" }),
  );
  const card = await screen.findByRole("dialog");
  await userEvent.clear(
    within(card).getByLabelText("Сообщение со слов заявителя", { exact: true }),
  );
  await userEvent.type(
    within(card).getByLabelText("Сообщение со слов заявителя", { exact: true }),
    "Сохранить мои слова",
  );
  await userEvent.click(
    within(card).getByRole("button", { name: "Сохранить черновик" }),
  );
  expect(await within(card).findByRole("alert")).toBeVisible();
  expect(
    within(card).getByLabelText("Сообщение со слов заявителя", { exact: true }),
  ).toHaveValue("Сохранить мои слова");
  expect(
    within(card).queryByText("Карточка передана на учебную проверку."),
  ).not.toBeInTheDocument();
});
it("submits only after saving and uses the returned revision", async () => {
  vi.spyOn(trainingApi, "saveDraft").mockResolvedValue({
    ...initial,
    card: { ...initial.card, revision: 4 },
  });
  vi.spyOn(trainingApi, "submit").mockResolvedValue({
    ...initial,
    status: "completed",
    ended_at: "2026-09-19T10:01:00Z",
    card: { ...initial.card, revision: 5, status: "notified" },
  });
  open();
  await userEvent.click(
    await screen.findByRole("button", { name: "Продолжить заполнение" }),
  );
  const card = await screen.findByRole("dialog");
  await userEvent.click(
    within(card).getByRole("button", {
      name: "Оповестить и сохранить карточку",
    }),
  );
  await waitFor(() =>
    expect(trainingApi.submit).toHaveBeenCalledWith("attempt", 4),
  );
  expect(
    await within(card).findByText("Карточка передана на учебную проверку."),
  ).toBeVisible();
});
it("does not offer DDS execution or create prototype cards", async () => {
  vi.mocked(trainingApi.studentLesson).mockResolvedValue({
    ...lesson,
    assignments: [
      {
        ...lesson.assignments[0],
        role: "dds",
        available: false,
        attempt_id: null,
      },
    ],
  });
  open();
  expect(await screen.findByRole("alert")).toHaveTextContent("ДДС и SIP");
  expect(
    screen.getByRole("button", { name: "Создать новую карточку" }),
  ).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Начать следующую карточку" }),
  ).not.toBeInTheDocument();
});
