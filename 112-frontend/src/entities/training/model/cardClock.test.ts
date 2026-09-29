import { describe, expect, it } from "vitest";
import { cardElapsedSeconds } from "./cardClock";

describe("card clocks", () => {
  const at = (seconds: number) => new Date(seconds * 1000).toISOString();
  it("excludes finished and current pauses, including historical DDS reaction instants", () => {
    const card = {
      started_at: at(10),
      pauses: [
        { start: at(20), end: at(50) },
        { start: at(70), end: null },
      ],
    };
    expect(cardElapsedSeconds(card, 90000)).toBe(30);
    expect(cardElapsedSeconds(card, 60000)).toBe(20);
    expect(cardElapsedSeconds(card, 15000)).toBe(5);
    expect(cardElapsedSeconds(card, 5000)).toBe(0);
  });
  it("keeps the wall clock when there are no pauses", () => {
    expect(cardElapsedSeconds({ started_at: at(0) }, 90000)).toBe(90);
  });
});
