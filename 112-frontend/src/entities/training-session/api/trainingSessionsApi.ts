import { api, apiEndpoints } from "@/shared/api";

import type { DemoTrainingSession } from "../model/demoSessions";

export const trainingSessionsApi = {
  list: () => api.get(apiEndpoints.sessions.list).json<DemoTrainingSession[]>(),
  getById: (sessionId: string) =>
    api
      .get(apiEndpoints.sessions.detail(sessionId))
      .json<DemoTrainingSession>(),
  start: (sessionId: string) =>
    api
      .post(apiEndpoints.sessions.start(sessionId))
      .json<DemoTrainingSession>(),
  complete: (sessionId: string) =>
    api
      .post(apiEndpoints.sessions.complete(sessionId))
      .json<DemoTrainingSession>(),
};
