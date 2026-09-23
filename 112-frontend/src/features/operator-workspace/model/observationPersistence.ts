import type { ClientObservation } from "@/entities/training";
import type { ObservationPersistence } from "../types/observationPersistence";

export function observationPersistence(
  attemptId: string,
): ObservationPersistence {
  const key = `training-observations:${attemptId}`;
  return {
    load: () => {
      const raw: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
      if (!Array.isArray(raw)) return [];
      return raw
        .filter(
          (event): event is ClientObservation =>
            event &&
            typeof event.command_id === "string" &&
            [
              "ui.field_changed",
              "ui.card_opened",
              "ui.card_closed",
              "ui.delivery_gap",
            ].includes(event.kind) &&
            typeof event.client_occurred_at === "string",
        )
        .slice(-200);
    },
    save: (events) => {
      if (events.length) sessionStorage.setItem(key, JSON.stringify(events));
      else sessionStorage.removeItem(key);
    },
  };
}
