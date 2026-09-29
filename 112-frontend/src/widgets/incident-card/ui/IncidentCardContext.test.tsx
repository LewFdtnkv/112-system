import "@testing-library/jest-dom/vitest";
import { emptyCardFields } from "@/entities/incident-card";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { IncidentCardDialog } from "./IncidentCardDialog";

afterEach(cleanup);
it("keeps two card contexts independent, including service selection in a portal", async () => {
  const saves = [
    vi.fn().mockResolvedValue(undefined),
    vi.fn().mockResolvedValue(undefined),
  ];
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      {["first", "second"].map((id, index) => (
        <IncidentCardDialog
          key={id}
          card={{
            id,
            createdAt: "",
            channel: "112",
            origin: "student",
            fields: { ...structuredClone(emptyCardFields), description: id },
          }}
          remote={{
            categories: [],
            categoryName: "",
            services: [{ id: "101", name: "Учебная служба" }],
            search: vi.fn(),
            select: vi.fn(),
            onSave: saves[index],
            searching: false,
            serviceQueryKey: id,
            loadServices: async () => ({
              items: [{ id: "101", name: "Учебная служба" }],
              total: 1,
            }),
          }}
          isSubmitted={false}
          isCallAccepted
          log={[]}
          elapsedSeconds={0}
          normSeconds={60}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      ))}
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  const second = screen.getByRole("dialog", {
    name: "Карточка происшествия № second",
  });
  const input = within(second).getByLabelText("Сообщение со слов заявителя", {
    exact: true,
  });
  await user.clear(input);
  await user.type(input, "Изменена только вторая карточка");
  await user.click(
    within(second).getByRole("button", { name: "Добавить службы" }),
  );
  const services = await screen.findByRole("dialog", {
    name: /Добавьте службы/,
  });
  await user.click(
    await within(services).findByRole("button", { name: "Учебная служба" }),
  );
  await user.click(
    within(services).getByRole("button", { name: "Сохранить и закрыть" }),
  );
  await user.click(
    await within(second).findByRole("button", { name: "Сохранить черновик" }),
  );
  await waitFor(() => expect(saves[1]).toHaveBeenCalledTimes(1));
  expect(saves[1].mock.calls[0][0]).toMatchObject({
    description: "Изменена только вторая карточка",
    manualServices: [],
  });
  expect(saves[0]).not.toHaveBeenCalled();
  const first = screen.getByRole("dialog", {
    name: "Карточка происшествия № first",
    hidden: true,
  });
  expect(
    within(first).getByLabelText("Сообщение со слов заявителя", {
      exact: true,
    }),
  ).toHaveValue("first");
});
