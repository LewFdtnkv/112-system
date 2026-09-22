import { describe, expect, it } from "vitest";
import type { FeatureDefinition } from "@/shared/types/features";
import { activeFeatureDefinitions, updateFeatureAnswer } from "./featureValues";

const fields: FeatureDefinition[] = [
  { key: "place", label: "Где", type: "choice", options: ["Улица", "Дом"] },
  {
    key: "object",
    label: "Объект",
    type: "choice",
    options: ["Мусор"],
    visible_when: [{ place: "Улица" }],
  },
  {
    key: "offense",
    label: "Правонарушение",
    visible_when: [{ object: "Мусор" }],
  },
  {
    key: "details",
    label: "Описание",
    type: "text",
    visible_when: [{ offense: true }],
  },
];
describe("conditional classifier fields", () => {
  it("clears the whole hidden branch on parent change or deselection", () => {
    const answers = {
      place: "Улица",
      object: "Мусор",
      offense: true,
      details: "Поджог",
    };
    expect(activeFeatureDefinitions(fields, answers)).toHaveLength(4);
    expect(updateFeatureAnswer(fields, answers, "place", "Дом")).toEqual({
      place: "Дом",
    });
    expect(updateFeatureAnswer(fields, answers, "place", undefined)).toEqual(
      {},
    );
  });
  it("does not let stale hidden answers expose descendants", () => {
    expect(
      activeFeatureDefinitions(fields, {
        place: "Дом",
        object: "Мусор",
        offense: true,
      }).map((f) => f.key),
    ).toEqual(["place"]);
  });
  it("supports OR alternatives and array membership without treating false as absent", () => {
    const definitions: FeatureDefinition[] = [
      { key: "flags", label: "Признаки", type: "array", options: ["A", "B"] },
      { key: "access", label: "Доступ" },
      {
        key: "note",
        label: "Комментарий",
        type: "text",
        visible_when: [{ flags: ["A"], access: false }, { access: true }],
      },
    ];
    expect(
      activeFeatureDefinitions(definitions, {
        flags: ["A", "B"],
        access: false,
      }),
    ).toHaveLength(3);
    expect(
      activeFeatureDefinitions(definitions, { access: true }),
    ).toHaveLength(3);
    expect(
      activeFeatureDefinitions(definitions, { flags: ["B"], access: false }),
    ).toHaveLength(2);
  });
});
