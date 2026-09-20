import { afterEach, expect, it, vi } from "vitest";
import { createObservationBuffer } from "./observationBuffer";
import type { ClientObservation } from "@/entities/training";

afterEach(() => vi.useRealTimers());
it("coalesces typing and sends only allowed semantic fields before a command", async () => {
  vi.useFakeTimers();
  const batches: ClientObservation[][] = [];
  const buffer = createObservationBuffer(
    { description: "" },
    async (events) => {
      batches.push(events);
    },
    vi.fn(),
  );
  buffer.open();
  await buffer.flush();
  buffer.observe({ description: "Д", password: "secret" });
  buffer.observe({ description: "Дым", password: "secret" });
  await buffer.flush();
  const changes = batches
    .flat()
    .filter((event) => event.kind === "ui.field_changed");
  expect(changes).toHaveLength(1);
  expect(changes[0]).toMatchObject({ field: "description", value: "Дым" });
  expect(JSON.stringify(batches)).not.toContain("secret");
  buffer.close();
  await buffer.flush();
  expect(batches.flat().at(-1)?.kind).toBe("ui.card_closed");
});

it("retries the same event IDs and does not block the exercise on network failure", async () => {
  vi.useFakeTimers();
  const send = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(undefined);
  const warning = vi.fn();
  const buffer = createObservationBuffer({}, send, warning);
  buffer.observe({ address: { street: "Учебная", house: "7" } });
  await buffer.flush();
  expect(warning).toHaveBeenLastCalledWith(true);
  const failed = send.mock.calls[0][0];
  await buffer.flush();
  expect(send.mock.calls[1][0]).toEqual(failed);
  expect(warning).toHaveBeenLastCalledWith(false);
  buffer.close();
  await buffer.flush();
});

it("audits feature lists and confirmed coordinates without duplicating unchanged arrays", async () => {
  const send = vi.fn().mockResolvedValue(undefined);
  const buffer = createObservationBuffer({}, send, vi.fn());
  buffer.observe({
    ekpAnswers: { signs: ["Дым", "Пламя"] },
    location: { latitude: 55, longitude: 37 },
  });
  await buffer.flush();
  expect(send.mock.calls[0][0]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        field: "ekpAnswers.signs",
        value: ["Дым", "Пламя"],
      }),
      expect.objectContaining({ field: "location.latitude", value: 55 }),
    ]),
  );
  buffer.observe({
    ekpAnswers: { signs: ["Дым", "Пламя"] },
    location: { latitude: 55, longitude: 37 },
  });
  await buffer.flush();
  expect(send).toHaveBeenCalledTimes(1);
  buffer.close();
  await buffer.flush();
});
