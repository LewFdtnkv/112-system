import { api, apiEndpoints } from "@/shared/api";

import type { DemoScenario, ScenarioDraft } from "../model/types";

export const scenariosApi = {
  list: () => api.get(apiEndpoints.scenarios.list).json<DemoScenario[]>(),
  getById: (scenarioId: string) =>
    api.get(apiEndpoints.scenarios.detail(scenarioId)).json<DemoScenario>(),
  create: (draft: ScenarioDraft) =>
    api.post(apiEndpoints.scenarios.list, { json: draft }).json<DemoScenario>(),
  update: (scenarioId: string, draft: ScenarioDraft) =>
    api
      .patch(apiEndpoints.scenarios.detail(scenarioId), { json: draft })
      .json<DemoScenario>(),
};
