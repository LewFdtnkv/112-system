import type { DemoScenario, ScenarioDraft } from "../model/types";
export interface DemoScenarioStore {
  scenarios: DemoScenario[];
  createScenario: (draft: ScenarioDraft) => string;
  updateScenario: (id: string, draft: ScenarioDraft) => boolean;
  upsertScenario: (scenario: DemoScenario) => void;
}
