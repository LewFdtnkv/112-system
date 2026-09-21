import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { type CardTemplate, trainingApi } from "@/entities/training";
import { CardEditor } from "../ui/CardEditor";

vi.setConfig({ testTimeout: 20_000 });

const card: CardTemplate = {
  id: "card-1",
  revision: 3,
  title: "Пожар в квартире",
  created_at: "2026-09-21T08:00:00Z",
  updated_at: "2026-09-21T08:00:00Z",
  can_edit: true,
  scenario_count: 0,
  classifier_label: "ЕКП",
  classifier_version_id: "version-1",
  classifier_entry_id: "entry-1",
  classifier_entry: {
    id: "entry-1",
    classifier_version_id: "version-1",
    code: "01",
    section: "Пожары",
    name: "Пожар",
    conditions: {},
    notification_required: true,
  },
  caller_message: "Горит квартира",
  instructions: "",
  recipients: [{ service_id: "s-1", name: "Служба 101" }],
  recipient_service_ids: ["s-1"],
  data: {
    caller_name: "Анна",
    caller_phone: "",
    address_text: "Учебная улица, дом 12",
    description: "Дым из окна",
    additional_fields: {},
  },
};

const phone = () =>
  screen.getByLabelText("Телефон заявителя") as HTMLInputElement;
const save = () => screen.getByRole("button", { name: "Сохранить изменения" });

function renderEditor() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CardEditor initial={card} onClose={() => undefined} />
    </QueryClientProvider>,
  );
}

let updateCard: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.spyOn(trainingApi, "routes").mockResolvedValue([]);
  vi.spyOn(trainingApi, "classifiers").mockResolvedValue([]);
  updateCard = vi
    .spyOn(trainingApi, "updateCard")
    .mockResolvedValue(card as never);
});
afterEach(cleanup);

it("не сохраняет неполный эталонный номер и возвращает фокус в поле", async () => {
  const user = userEvent.setup();
  renderEditor();
  await waitFor(() => expect(save()).toBeEnabled());

  await user.type(phone(), "900");
  await user.click(save());

  expect(updateCard).not.toHaveBeenCalled();
  expect(
    screen.getByText("Неполный номер: не хватает 7 цифр"),
  ).toBeInTheDocument();
  expect(phone()).toHaveAttribute("aria-invalid", "true");
  expect(phone()).toHaveFocus();
});

it("сохраняет номер в каноническом виде после исправления", async () => {
  const user = userEvent.setup();
  renderEditor();
  await waitFor(() => expect(save()).toBeEnabled());

  await user.type(phone(), "89991234567");
  expect(phone()).toHaveValue("+7 999 123-45-67");
  await user.click(save());

  await waitFor(() => expect(updateCard).toHaveBeenCalledTimes(1));
  const [, body] = updateCard.mock.calls[0] as [
    string,
    { data: { caller_phone: string } },
  ];
  expect(body.data.caller_phone).toBe("+7 999 123-45-67");
});

it("разрешает сохранить карточку без телефона", async () => {
  const user = userEvent.setup();
  renderEditor();
  await waitFor(() => expect(save()).toBeEnabled());

  await user.click(save());

  await waitFor(() => expect(updateCard).toHaveBeenCalledTimes(1));
  const [, body] = updateCard.mock.calls[0] as [
    string,
    { data: { caller_phone: string } },
  ];
  expect(body.data.caller_phone).toBe("");
});
