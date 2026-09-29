import type { Attempt } from "../types/attempt";

/** Pause intervals also work for a historical instant such as the first DDS response. */
export function cardElapsedSeconds(
  card: Pick<Attempt, "started_at" | "pauses">,
  end: number,
) {
  const start = Date.parse(card.started_at);
  const paused = (card.pauses ?? []).reduce(
    (sum, pause) =>
      sum +
      Math.max(
        0,
        Math.min(end, pause.end ? Date.parse(pause.end) : end) -
          Math.max(start, Date.parse(pause.start)),
      ),
    0,
  );
  return Math.max(0, Math.floor((end - start - paused) / 1000));
}
