export type ScenarioStatus = "draft" | "ready";

export type ScenarioDifficulty = "basic" | "advanced";

export interface DemoScenario {
  id: string;
  name: string;
  category: string;
  difficulty: ScenarioDifficulty;
  durationMinutes: number;
  normSeconds: number;
  description: string;
  status: ScenarioStatus;
}

export type ScenarioDraft = Omit<DemoScenario, "id">;
