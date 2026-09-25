import { defaultLearningPolicy } from "@/entities/training";
import { telephonyApi } from "@/entities/telephony";
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
  activityApi,
  attemptApi,
  lessonApi,
  trainingKeys,
  type StudentLesson,
} from "@/entities/training";
import { TrainingWorkspacePage } from "./TrainingWorkspacePage";
import { initialAttempt as initial } from "../model/attemptFixture";

const lesson: StudentLesson = {
  learning: defaultLearningPolicy(),
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
  vi.spyOn(telephonyApi, "state").mockResolvedValue({
    enabled: false,
    station: null,
    cues: [],
    calls: [],
  });
  vi.spyOn(activityApi, "messages").mockResolvedValue({
    items: [],
    total: 0,
    limit: 20,
    offset: 0,
  });
  vi.spyOn(activityApi, "proctoring").mockResolvedValue(new Response());
  vi.spyOn(lessonApi, "studentLesson").mockResolvedValue(lesson);
  vi.spyOn(attemptApi, "get").mockResolvedValue(structuredClone(initial));
  vi.spyOn(attemptApi, "entries").mockResolvedValue([]);
  vi.spyOn(attemptApi, "recipients").mockResolvedValue([]);
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
it("does not overwrite edited fields when the shared server snapshot updates", async () => {
  const client = open();
  await userEvent.click(
    await screen.findByRole("button", { name: "Продолжить заполнение" }),
  );
  const input = within(await screen.findByRole("dialog")).getByLabelText(
    "Сообщение со слов заявителя",
    { exact: true },
  );
  await userEvent.clear(input);
  await userEvent.type(input, "Несохранённые слова ученика");
  client.setQueryData(trainingKeys.attempt(initial.id), {
    ...initial,
    card: {
      ...initial.card,
      revision: 4,
      data: {
        ...initial.card.data,
        description: "Обновлённый серверный снимок",
      },
    },
  });
  await waitFor(() => expect(input).toHaveValue("Несохранённые слова ученика"));
});

it("retries a failed attempt query when the student opens it again", async () => {
  vi.mocked(attemptApi.get).mockRejectedValueOnce(new Error("offline"));
  open();
  const button = await screen.findByRole("button", {
    name: "Продолжить заполнение",
  });
  await userEvent.click(button);
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  expect(await screen.findByRole("dialog")).toBeVisible();
  expect(attemptApi.get).toHaveBeenCalledTimes(2);
});
it("keeps entered values when saving fails", async () => {
  vi.spyOn(attemptApi, "saveDraft").mockRejectedValue(new Error("offline"));
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
  vi.mocked(attemptApi.get).mockResolvedValue({
    ...structuredClone(initial),
    card: { ...initial.card, classifier_entry_id: "entry" },
  });
  vi.spyOn(attemptApi, "saveDraft").mockResolvedValue({
    ...initial,
    card: { ...initial.card, revision: 4 },
  });
  vi.spyOn(attemptApi, "submit").mockResolvedValue({
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
    expect(attemptApi.submit).toHaveBeenCalledWith("attempt", 4),
  );
  expect(
    await screen.findByText("Карточка передана на учебную проверку."),
  ).toBeVisible();
});
it("does not start an unavailable legacy DDS assignment", async () => {
  vi.mocked(lessonApi.studentLesson).mockResolvedValue({
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
  expect(
    await screen.findByRole("button", { name: "Приступить к заданию" }),
  ).toBeDisabled();
  expect(screen.getByText(/Камера и экран не записываются/)).toBeVisible();
});
