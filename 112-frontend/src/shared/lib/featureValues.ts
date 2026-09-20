export type FeatureValue = boolean | string | string[];
export interface FeatureDefinition {
  key: string;
  label: string;
  type?: "boolean" | "choice" | "array";
  required?: boolean;
  options?: string[];
}
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
