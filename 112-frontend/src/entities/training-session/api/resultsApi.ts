import { api, apiEndpoints } from "@/shared/api";

import type { DemoTrainingResult } from "../model/demoSessions";

export const resultsApi = {
  list: () => api.get(apiEndpoints.results.list).json<DemoTrainingResult[]>(),
  getBySessionId: (sessionId: string) =>
    api.get(apiEndpoints.results.detail(sessionId)).json<DemoTrainingResult>(),
};
