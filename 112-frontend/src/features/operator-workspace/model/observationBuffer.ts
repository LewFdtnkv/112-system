import type { ClientObservation } from "@/entities/training";
import { randomUUID } from "@/shared/lib/uuid";
import type { ObservationPersistence } from "../types/observationPersistence";

const fieldPattern =
  /^(ekpAnswers\.[a-z][a-z0-9_]{0,49}|location\.(latitude|longitude)|categoryId|callerName|description|operatorAction|victimsCount|address\.(country|region|locality|object|district|area|street|house|building|structure|apartment|entrance|floor|doorCode|description)|phones\.(callerId|provided|onSite)|details\.(buildingFloors|classificationDescription|callerStatus|callerGender|callerAge|foreignLanguage|hasVictims|noContact|callDropped|refusedAmbulance|blocked))$/;
function flatten(
  value: unknown,
  prefix = "",
): Record<string, ClientObservation["value"]> {
  if (value && typeof value === "object" && !Array.isArray(value))
    return Object.assign(
      {},
      ...Object.entries(value).map(([key, child]) =>
        flatten(child, [prefix, key].filter(Boolean).join(".")),
      ),
    );
  return fieldPattern.test(prefix) &&
    (value === null ||
      ["string", "number", "boolean"].includes(typeof value) ||
      (prefix.startsWith("ekpAnswers.") &&
        Array.isArray(value) &&
        value.every((v) => typeof v === "string")))
    ? { [prefix]: value as ClientObservation["value"] }
    : {};
}

export function createObservationBuffer(
  initial: unknown,
  send: (events: ClientObservation[]) => Promise<unknown>,
  warning: (failed: boolean) => void,
  persistence?: ObservationPersistence,
) {
  let baseline = flatten(initial);
  const pending = new Map<string, ClientObservation>();
  const queue: ClientObservation[] = [];
  try {
    queue.push(...(persistence?.load() ?? []));
  } catch {
    warning(true);
  }
  let sending: ClientObservation[] = [];
  let lost = 0;
  const persist = () => {
    try {
      persistence?.save([...sending, ...queue, ...pending.values()]);
    } catch {
      warning(true);
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flight: Promise<void> | undefined;
  let closed = false;
  let retries = 0;
  const make = (kind: ClientObservation["kind"]): ClientObservation => ({
    kind,
    command_id: randomUUID(),
    client_occurred_at: new Date().toISOString(),
  });
  const flush = (): Promise<void> => {
    clearTimeout(timer);
    if (flight) return flight;
    const drain = async () => {
      while (queue.length || pending.size) {
        queue.push(...pending.values());
        pending.clear();
        const batch = queue.splice(0, 20);
        sending = batch;
        persist();
        try {
          await send(batch);
          sending = [];
          persist();
          retries = 0;
          warning(false);
        } catch {
          sending = [];
          queue.unshift(...batch);
          persist();
          warning(true);
          retries += 1;
          if (retries <= 3 && !closed)
            timer = setTimeout(() => void flush(), 5000);
          break;
        }
      }
    };
    flight = drain().finally(() => {
      flight = undefined;
    });
    return flight;
  };
  const observe = (fields: unknown) => {
    if (closed) return;
    const next = flatten(fields);
    for (const key of new Set([
      ...Object.keys(baseline),
      ...Object.keys(next),
    ])) {
      if (JSON.stringify(baseline[key]) !== JSON.stringify(next[key]))
        pending.set(key, {
          ...make("ui.field_changed"),
          field: key,
          value: next[key] ?? null,
        });
    }
    baseline = next;
    while (queue.length + pending.size > 180 && queue.length) {
      const removed = queue.shift();
      lost += removed?.kind === "ui.delivery_gap" ? Number(removed.value) : 1;
    }
    if (lost) {
      lost += Number(pending.get("delivery-gap")?.value ?? 0);
      pending.set("delivery-gap", {
        ...make("ui.delivery_gap"),
        value: Math.min(lost, 100000),
      });
      lost = 0;
    }
    persist();
    clearTimeout(timer);
    if (queue.length < 200) timer = setTimeout(() => void flush(), 750);
    else warning(true);
  };
  return {
    observe,
    flush,
    open: () => {
      closed = false;
      queue.push(make("ui.card_opened"));
      persist();
      void flush();
    },
    close: () => {
      closed = true;
      queue.push(...pending.values(), make("ui.card_closed"));
      pending.clear();
      persist();
      void flush();
    },
  };
}
