import { afterEach, expect, it } from "vitest";

import {
  cardDraftStorageKey,
  clearCardDraft,
  readCardDraft,
  writeCardDraft,
} from "./cardDraft";
import { emptyCardFields, getMissingCardFields } from "./types";

afterEach(() => localStorage.clear());

it("clears only the submitted card and preserves other cards and sessions", () => {
  writeCardDraft("session-1", "card-1", {
    ...emptyCardFields,
    address: { ...emptyCardFields.address, street: "One" },
  });
  writeCardDraft("session-1", "card-2", {
    ...emptyCardFields,
    address: { ...emptyCardFields.address, street: "Two" },
  });
  writeCardDraft("session-2", "card-1", {
    ...emptyCardFields,
    address: { ...emptyCardFields.address, street: "Three" },
  });
  clearCardDraft("session-1", "card-1");
  expect(readCardDraft("session-1", "card-1")).toBeNull();
  expect(readCardDraft("session-1", "card-2")?.address.street).toBe("Two");
  expect(readCardDraft("session-2", "card-1")?.address.street).toBe("Three");
});

it("reads an existing legacy draft and removes it when its card is submitted", () => {
  localStorage.setItem(
    cardDraftStorageKey("session-1"),
    JSON.stringify({
      cardId: "card-1",
      fields: {
        address: "Legacy",
        district: "ЮАО",
        callerPhone: "+7 900 123-45-67",
      },
    }),
  );
  expect(readCardDraft("session-1", "card-1")).toEqual({
    ...emptyCardFields,
    address: {
      ...emptyCardFields.address,
      description: "Legacy",
      district: "ЮАО",
    },
    phones: { ...emptyCardFields.phones, provided: "+7 900 123-45-67" },
  });
  clearCardDraft("session-1", "card-2");
  expect(readCardDraft("session-1", "card-1")?.address.description).toBe(
    "Legacy",
  );
  clearCardDraft("session-1", "card-1");
  expect(readCardDraft("session-1", "card-1")).toBeNull();
});

it("restores every structured address and phone field", () => {
  const fields = {
    ...emptyCardFields,
    categoryId: "fire",
    address: {
      district: "СВАО",
      area: "Останкинский район",
      street: "ул. Академика Королёва",
      house: "24",
      building: "1",
      apartment: "56",
      entrance: "3",
      floor: "7",
      description: "Вход со двора",
    },
    callerName: "Иванова М. С.",
    phones: {
      callerId: "+7 900 000-00-01",
      provided: "+7 900 000-00-02",
      onSite: "+7 900 000-00-03",
    },
    victimsCount: 0,
    description: "Дым в подъезде",
    operatorAction: "Вызов принят",
    services: ["101" as const],
  };

  writeCardDraft("session-1", "card-1", fields);
  expect(readCardDraft("session-1", "card-1")).toEqual(fields);
});

it.each([
  "{",
  "null",
  "[]",
  JSON.stringify({ cardId: "card-1" }),
  JSON.stringify({ cardId: "card-1", fields: null }),
  JSON.stringify({ cardId: "card-1", fields: "invalid" }),
  JSON.stringify({ cardId: "card-1", fields: [] }),
  JSON.stringify({ cardId: "other-card", fields: emptyCardFields }),
])("ignores malformed or unrelated saved data: %s", (raw) => {
  localStorage.setItem(cardDraftStorageKey("session-1", "card-1"), raw);
  expect(readCardDraft("session-1", "card-1")).toBeNull();
});

it("normalizes invalid nested fields without breaking card validation", () => {
  localStorage.setItem(
    cardDraftStorageKey("session-1", "card-1"),
    JSON.stringify({
      cardId: "card-1",
      fields: {
        address: { street: 42, house: null, floor: "3" },
        phones: { provided: [], onSite: "+7 900 000-00-01" },
        victimsCount: -1,
        services: ["101", "invalid", null],
        status: "invalid",
      },
    }),
  );

  const fields = readCardDraft("session-1", "card-1")!;
  expect(fields).toEqual({
    ...emptyCardFields,
    address: { ...emptyCardFields.address, floor: "3" },
    phones: { ...emptyCardFields.phones, onSite: "+7 900 000-00-01" },
    services: ["101"],
  });
  expect(getMissingCardFields(fields)).toContain("address");
});
