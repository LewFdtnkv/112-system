import { afterEach, expect, it, vi } from "vitest";
import { createObservationBuffer } from "./observationBuffer";
import type { ClientObservation } from "@/entities/training";

afterEach(() => vi.useRealTimers());
it("restores undelivered events with the same IDs after reload and clears acknowledged storage", async () => {
  let saved: ClientObservation[] = [];
  const persistence = {
    load: () => saved,
    save: (events: ClientObservation[]) => {
      saved = [...events];
    },
  };
  const first = createObservationBuffer(
    {},
    async () => {
      throw new Error("offline");
    },
    vi.fn(),
    persistence,
  );
  first.observe({ description: "Учебное сообщение" });
  await first.flush();
  first.close();
  await first.flush();
  const originalIds = saved.map((e) => e.command_id);
  const send = vi.fn().mockResolvedValue(undefined);
  const reopened = createObservationBuffer({}, send, vi.fn(), persistence);
  await reopened.flush();
  expect(
    send.mock.calls.flatMap(([events]) =>
      events.map((e: ClientObservation) => e.command_id),
    ),
  ).toEqual(originalIds);
  expect(saved).toEqual([]);
});

it("reports bounded delivery gaps after prolonged failure instead of growing forever", async () => {
  vi.useFakeTimers();
  let saved: ClientObservation[] = [];
  const persistence = {
    load: () => saved,
    save: (events: ClientObservation[]) => {
      saved = [...events];
    },
  };
  const first = createObservationBuffer(
    {},
    async () => {
      throw new Error("offline");
    },
    vi.fn(),
    persistence,
  );
  for (let i = 0; i < 240; i++) {
    first.observe({ description: String(i) });
    await first.flush();
  }
  expect(saved.length).toBeLessThanOrEqual(200);
  expect(saved.some((event) => event.kind === "ui.delivery_gap")).toBe(true);
  first.close();
  await first.flush();
});
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

it("audits all ARM flags, including turning a flag off", async () => {
  const send = vi.fn().mockResolvedValue(undefined);
  const buffer = createObservationBuffer({}, send, vi.fn());
  const details = {
    hasVictims: true,
    refusedAmbulance: true,
    blocked: true,
    noContact: true,
    callDropped: true,
  };
  buffer.observe({ details });
  await buffer.flush();
  expect(
    send.mock.calls[0][0].map((e: ClientObservation) => e.field).sort(),
  ).toEqual(
    Object.keys(details)
      .map((k) => `details.${k}`)
      .sort(),
  );
  buffer.observe({ details: { ...details, callDropped: false } });
  await buffer.flush();
  expect(send.mock.calls[1][0]).toEqual([
    expect.objectContaining({ field: "details.callDropped", value: false }),
  ]);
  buffer.close();
  await buffer.flush();
});
