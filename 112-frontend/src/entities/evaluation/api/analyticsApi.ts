import { api, apiEndpoints } from "@/shared/api";

export interface AnalyticsSummary {
  totalSessions: number;
  completedSessions: number;
  activeSessions: number;
  averageScore: number | null;
}

export const analyticsApi = {
  getSummary: () =>
    api.get(apiEndpoints.analytics.summary).json<AnalyticsSummary>(),
};
