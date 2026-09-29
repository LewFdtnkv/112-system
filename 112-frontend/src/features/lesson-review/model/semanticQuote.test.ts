import { describe, expect, it } from "vitest";
import { semanticQuote } from "./semanticQuote";

describe("semanticQuote", () => {
  it("renders frozen crew evidence in readable form without losing comments", () => {
    expect(
      semanticQuote(
        '[{"crew":"Бригада 1","status":"arrived","comment":"432"}]',
      ),
    ).toBe("Бригада 1 · Прибытие: 432");
  });
  it("preserves ordinary prose and incomplete citations exactly", () => {
    for (const quote of [
      "Бригада прибыла",
      '[{"crew":"Бригада"',
      '[{"unknown":1}]',
    ]) {
      expect(semanticQuote(quote)).toBe(quote);
    }
  });
});
