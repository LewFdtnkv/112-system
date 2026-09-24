import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  attemptQueryOptions,
  attemptApi,
  trainingKeys,
  useAttemptSnapshot,
  type Attempt,
} from "@/entities/training";
import { attemptCard } from "@/features/incident-editing";
import { initialAttempt as initial } from "./attemptFixture";
import { useAttemptWrites } from "./useAttemptWrites";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const writes = renderHook(() => useAttemptWrites(initial), { wrapper });
  const observer = renderHook(() => useAttemptSnapshot(initial), { wrapper });
  return { client, writes, observer };
}

it("serializes saves and submission and shares each returned revision with all observers", async () => {
  let finishFirst!: (value: Attempt) => void;
  const save = vi
    .spyOn(attemptApi, "saveDraft")
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
    )
    .mockResolvedValueOnce({
      ...initial,
      card: { ...initial.card, revision: 5 },
    });
  const submit = vi.spyOn(attemptApi, "submit").mockResolvedValue({
    ...initial,
    status: "completed",
    card: { ...initial.card, revision: 6 },
  });
  const { writes, observer, client } = setup();
  let first!: Promise<Attempt>,
    second!: Promise<Attempt>,
    last!: Promise<Attempt>;
  act(() => {
    first = writes.result.current.draft.mutateAsync(
      attemptCard(initial).fields,
    );
    second = writes.result.current.draft.mutateAsync({
      ...attemptCard(initial).fields,
      description: "Следующий текст",
    });
    last = writes.result.current.submit.mutateAsync();
  });
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(submit).not.toHaveBeenCalled();
  await act(async () => {
    finishFirst({ ...initial, card: { ...initial.card, revision: 4 } });
    await Promise.all([first, second, last]);
  });
  expect(save.mock.calls.map((args) => args[1])).toEqual([3, 4]);
  expect(save.mock.calls[1][3].description).toBe("Следующий текст");
  expect(submit).toHaveBeenCalledWith(initial.id, 5);
  await waitFor(() =>
    expect(observer.result.current.data.status).toBe("completed"),
  );
  expect(
    client.getQueryData<Attempt>(trainingKeys.attempt(initial.id))?.card
      .revision,
  ).toBe(6);
});

it("keeps the confirmed revision after failure and lets a later save recover", async () => {
  const save = vi
    .spyOn(attemptApi, "saveDraft")
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({
      ...initial,
      card: { ...initial.card, revision: 4 },
    });
  const { writes, observer } = setup();
  await act(async () => {
    await expect(
      writes.result.current.draft.mutateAsync(attemptCard(initial).fields),
    ).rejects.toThrow("offline");
  });
  expect(observer.result.current.data.card.revision).toBe(3);
  await act(async () => {
    await writes.result.current.draft.mutateAsync(attemptCard(initial).fields);
  });
  expect(save.mock.calls.map((args) => args[1])).toEqual([3, 3]);
  await waitFor(() =>
    expect(observer.result.current.data.card.revision).toBe(4),
  );
});

it("cancels a stale read before saving so it cannot overwrite a new revision", async () => {
  let finishRead!: (value: Attempt) => void;
  const read = vi.spyOn(attemptApi, "get").mockImplementation(
    () =>
      new Promise((resolve) => {
        finishRead = resolve;
      }),
  );
  vi.spyOn(attemptApi, "saveDraft").mockResolvedValue({
    ...initial,
    card: { ...initial.card, revision: 4 },
  });
  const { writes, client } = setup();
  const pending = client
    .fetchQuery({ ...attemptQueryOptions(initial.id), staleTime: 0 })
    .catch(() => undefined);
  await waitFor(() => expect(read).toHaveBeenCalledOnce());
  await act(async () => {
    await writes.result.current.draft.mutateAsync(attemptCard(initial).fields);
  });
  await act(async () => {
    finishRead(initial);
    await pending;
  });
  expect(
    client.getQueryData<Attempt>(trainingKeys.attempt(initial.id))?.card
      .revision,
  ).toBe(4);
});
