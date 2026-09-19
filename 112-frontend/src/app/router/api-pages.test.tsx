import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { useAuthStore } from "@/entities/user";
import { trainingApi } from "@/entities/training";
import { AppProviders } from "../providers/AppProviders";
import { routes } from "./routes";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useAuthStore.getState().clearSession();
});
function renderPage(path: string, role: string) {
  useAuthStore.getState().setSession({ userId: "server-user", roles: [role] });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
}
it.each([
  ["/admin", "student"],
  ["/users", "teacher"],
  ["/scenarios", "student"],
  ["/groups", "admin"],
  ["/catalogs", "teacher"],
  ["/student/sessions/lesson", "teacher"],
])("denies %s to %s", async (path, role) => {
  const router = renderPage(path, role);
  await screen.findByRole("heading", { name: /Доступ запрещён/ });
  expect(router.state.location.pathname).toBe("/403");
});
it("shows an empty real student account without fixture lessons", async () => {
  vi.spyOn(trainingApi, "lessons").mockResolvedValue({
    items: [],
    total: 0,
    limit: 20,
    offset: 0,
    assigned_count: 0,
    in_progress_count: 0,
    submitted_count: 0,
    graded_count: 0,
  });
  renderPage("/student", "student");
  expect(await screen.findByText("Занятия не найдены")).toBeVisible();
  expect(trainingApi.lessons).toHaveBeenCalledWith(
    true,
    expect.objectContaining({ offset: 0 }),
    expect.any(AbortSignal),
  );
});
it("shows a fallback for legacy work without a persisted grade", async () => {
  vi.spyOn(trainingApi, "evaluation").mockResolvedValue(null);
  vi.spyOn(trainingApi, "studentLesson").mockResolvedValue({
    id: "lesson",
    title: "Сданная работа",
    status: "finished",
    started_at: null,
    ended_at: null,
    work_status: "submitted",
    assignments: [],
  });
  renderPage("/results/lesson", "student");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Автоматическая оценка недоступна",
  );
  expect(screen.queryByText(/Итог:/)).not.toBeInTheDocument();
});
it("shows a request failure with retry instead of demo fallback", async () => {
  vi.spyOn(trainingApi, "scenarios").mockRejectedValue(new Error("offline"));
  renderPage("/scenarios", "teacher");
  expect(
    await screen.findByRole("button", { name: "Повторить" }),
  ).toBeVisible();
});
