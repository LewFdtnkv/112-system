import type { FeatureDefinition, FeatureValue } from "@/shared/types/features";
export type { FeatureDefinition, FeatureValue } from "@/shared/types/features";
export const featureText = (v: FeatureValue | undefined) =>
  v === undefined
    ? "Не указано"
    : typeof v === "boolean"
      ? v
        ? "Да"
        : "Нет"
      : Array.isArray(v)
        ? v.join(", ")
        : v;
export const matchesFeature = (
  actual: FeatureValue | undefined,
  expected: FeatureValue,
) =>
  Array.isArray(expected)
    ? Array.isArray(actual) && expected.every((v) => actual.includes(v))
    : actual === expected;

export function activeFeatureDefinitions(
  definitions: FeatureDefinition[],
  answers: Record<string, FeatureValue> = {},
) {
  const activeAnswers: Record<string, FeatureValue> = {};
  return definitions.filter((feature) => {
    const visible =
      !feature.visible_when?.length ||
      feature.visible_when.some((group) =>
        Object.entries(group).every(
          ([key, expected]) =>
            key in activeAnswers &&
            matchesFeature(activeAnswers[key], expected),
        ),
      );
    if (visible && feature.key in answers)
      activeAnswers[feature.key] = answers[feature.key];
    return visible;
  });
}

export function updateFeatureAnswer(
  definitions: FeatureDefinition[],
  answers: Record<string, FeatureValue> | undefined,
  key: string,
  value: FeatureValue | undefined,
) {
  const next = { ...answers };
  if (value === undefined) delete next[key];
  else next[key] = value;
  const active = new Set(
    activeFeatureDefinitions(definitions, next).map((f) => f.key),
  );
  return Object.fromEntries(
    Object.entries(next).filter(([key]) => active.has(key)),
  );
}
