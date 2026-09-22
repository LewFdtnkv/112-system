import type { ScenarioDifficulty, ScenarioStatus } from "../types/types";

export const scenarioStatusLabels: Record<ScenarioStatus, string> = {
  draft: "Черновик",
  ready: "Готов к занятию",
};

export const scenarioDifficultyLabels: Record<ScenarioDifficulty, string> = {
  basic: "Базовый",
  advanced: "Повышенный",
};

export type {
  DemoScenario,
  ScenarioDifficulty,
  ScenarioDraft,
  ScenarioStatus,
} from "../types/types";
