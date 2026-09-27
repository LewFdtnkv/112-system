import { backendApi } from "@/shared/api";
import type { GroupAnalysis } from "../types";

export const groupAnalysisApi = {
  read: (id: string, role: string, days: number, signal?: AbortSignal) =>
    backendApi
      .get(`teaching/groups/${encodeURIComponent(id)}/analysis`, {
        searchParams: { role, days },
        signal,
      })
      .json<GroupAnalysis>(),
  create: (id: string, role: string, days: number) =>
    backendApi
      .post(`teaching/groups/${encodeURIComponent(id)}/analysis`, {
        searchParams: { role, days },
      })
      .json(),
};
