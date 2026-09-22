import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { emptyCardFields } from "@/entities/incident-card";
import type { RemoteEditor } from "../types/useIncidentEditor";
import { useIncidentEditor } from "./useIncidentEditor";

afterEach(cleanup);
function setup(onSave: RemoteEditor["onSave"]) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const onSubmit = vi.fn();
  const hook = renderHook(
    () =>
      useIncidentEditor({
        card: {
          id: "card",
          createdAt: "",
          channel: "112",
          origin: "student",
          fields: structuredClone(emptyCardFields),
        },
        remote: {
          categories: [],
          categoryName: "",
          services: [{ id: "service", name: "101" }],
          search: vi.fn(),
          select: vi.fn(),
          onSave,
          searching: false,
        },
        log: [],
        isSubmitted: false,
        isCallAccepted: true,
        onSubmit,
      }),
    {
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  return { ...hook, onSubmit };
}

it("keeps failed edits, retries them and removes the saved notice after another edit", async () => {
  const save = vi
    .fn<RemoteEditor["onSave"]>()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(undefined);
  const { result } = setup(save);
  act(() => {
    result.current.setAddressField("street", "Учебная");
    result.current.setAddressField("house", "7");
    result.current.setField("description", "Дым из окна");
    result.current.toggleService("service");
  });
  act(() => result.current.saveDraft());
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.fields.address).toMatchObject({
    street: "Учебная",
    house: "7",
  });
  expect(result.current.fields.description).toBe("Дым из окна");
  expect(result.current.fields.services).toEqual([]);
  expect(result.current.saved).toBe(false);
  act(() => result.current.saveDraft());
  await waitFor(() => expect(result.current.saved).toBe(true));
  expect(result.current.dirty).toBe(false);
  expect(result.current.error).toBeUndefined();
  expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
  act(() => result.current.setDetail("blocked", true));
  expect(result.current.saved).toBe(false);
  expect(result.current.dirty).toBe(true);
});

it("blocks submission while the draft request is pending", async () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  const save = vi.fn(() => promise);
  const { result, onSubmit } = setup(save);
  act(() => result.current.saveDraft());
  await waitFor(() => expect(result.current.pending).toBe(true));
  act(() => {
    result.current.saveDraft();
    result.current.submit();
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(onSubmit).not.toHaveBeenCalled();
  await act(async () => resolve());
  await waitFor(() => expect(result.current.pending).toBe(false));
  act(() => result.current.submit());
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
});
