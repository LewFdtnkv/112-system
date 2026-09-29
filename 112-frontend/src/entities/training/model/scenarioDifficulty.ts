import type { ScenarioInput } from "../types/scenario";

export const scenarioDifficultyLabels: Record<
  ScenarioInput["difficulty"],
  string
> = {
  basic: "Базовый",
  intermediate: "Средний",
  advanced: "Сложный",
};

export function scenarioDifficultyLabel(
  value: ScenarioInput["difficulty"] | null | undefined,
) {
  return value ? (scenarioDifficultyLabels[value] ?? "Не задан") : "Не задан";
}
