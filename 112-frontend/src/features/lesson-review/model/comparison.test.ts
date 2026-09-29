import { describe, expect, it } from "vitest";
import {
  comparisonFields,
  comparisonFeedback,
  fieldVerdict,
  type ReviewedCard,
  type ComparisonField,
} from "./comparison";

const row: ReviewedCard = {
  assignment_id: "assignment",
  position: 1,
  attempt: null,
  automatic_check: null,
  source_snapshot: {
    title: "Карточка",
    caller_message: "Условие",
    feature_definitions: [{ key: "people", label: "Угроза людям" }],
    data: {
      description: "Дым",
      features: { victimsCount: 0, ekp: { people: false } },
      additional_fields: {},
    },
  },
};
const field: ComparisonField = {
  field: "description",
  label: "Сообщение",
  group: "Происшествие",
  expected: "Дым из окна",
  actual: "Задымление",
  scored: false,
  status: "needs_review",
};
describe("review evidence presentation", () => {
  it("keeps zero and false, labels custom features and never grades an unstarted answer", () => {
    const fields = comparisonFields(row);
    expect(
      fields.find((f) => f.field === "features.victimsCount")?.expected,
    ).toBe("0");
    expect(fields.find((f) => f.field === "features.ekp.people")).toMatchObject(
      { expected: "Нет", label: expect.stringContaining("Угроза людям") },
    );
    expect(fields.every((f) => fieldVerdict(f).tone === "neutral")).toBe(true);
  });
  it("distinguishes semantic uncertainty from a checked error and unfinished draft", () => {
    expect(fieldVerdict(field).tone).toBe("warning");
    expect(fieldVerdict({ ...field, status: "missing" }).tone).toBe("warning");
    expect(
      fieldVerdict({ ...field, scored: true, status: "different" }).tone,
    ).toBe("error");
    expect(
      fieldVerdict({ ...field, scored: true, status: "missing" }, false),
    ).toMatchObject({ tone: "warning", label: "Пока не заполнено" });
  });
  it("uses the server verdict even when visually different formatting is accepted", () => {
    const check = {
      method: "rules",
      fields: [
        {
          ...field,
          field: "caller_phone",
          label: "Телефон",
          expected: "+7 999 123-45-67",
          actual: "89991234567",
          status: "matched" as const,
          scored: true,
        },
      ],
      matched: 1,
      missing: 0,
      different: 0,
      needs_review: 0,
      earned_points: 1,
      possible_points: 1,
      score_percent: 100,
    };
    expect(
      comparisonFeedback({ ...row, automatic_check: check })["Предоставленный"],
    ).toMatchObject({ tone: "success" });
  });
});
