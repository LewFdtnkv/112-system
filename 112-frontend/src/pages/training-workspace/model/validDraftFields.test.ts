import { expect, it } from "vitest";
import { emptyCardFields } from "@/entities/incident-card";
import { validDraftFields } from "./validDraftFields";

it("accepts complete drafts, including typed incident answers", () => {
  expect(validDraftFields(emptyCardFields)).toBe(true);
  expect(
    validDraftFields({
      ...emptyCardFields,
      details: { hasVictims: true, clarifications: { building: ["Дом"] } },
      ekpAnswers: { flame: true, location: "Дом", conditions: ["Дым"] },
    }),
  ).toBe(true);
});

it.each([
  { address: {} },
  { victimsCount: {} },
  { details: { clarifications: { building: "Дом" } } },
  { ekpAnswers: { location: {} } },
  { services: [42] },
])("rejects damaged nested fields: %j", (patch) => {
  expect(validDraftFields({ ...emptyCardFields, ...patch })).toBe(false);
});
