import { backendApi } from "@/shared/api";
import type { AIJobDetail, AIJobFilters, AIJobPage } from "../types";
export const aiJobsApi = {
  list: (filters: AIJobFilters, signal?: AbortSignal) =>
    backendApi
      .get("admin/ai-jobs", {
        signal,
        searchParams: {
          limit: 20,
          offset: filters.offset,
          q: filters.q,
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.purpose ? { purpose: filters.purpose } : {}),
        },
      })
      .json<AIJobPage>(),
  detail: (id: string, signal?: AbortSignal) =>
    backendApi
      .get(`admin/ai-jobs/${encodeURIComponent(id)}`, { signal })
      .json<AIJobDetail>(),
};
