import type { Analytics } from "../model/types";
import type { ErrorAnalytics } from "../types/errorAnalytics";
import type { Params } from "@/shared/types/query";
import { apiGet as get } from "@/shared/api/apiClient";

/** Aggregate analytics and administrator dashboard counters. */
export const analyticsApi = {
  errors: (params: Params, signal?: AbortSignal) =>
    get<ErrorAnalytics>("views/analytics/errors", params, signal),
  get: (params: Params, signal?: AbortSignal) =>
    get<Analytics>("views/analytics", params, signal),
  adminSummary: (signal?: AbortSignal) =>
    get<{ users: number; services: number; classifiers: number }>(
      "views/admin/dashboard",
      {},
      signal,
    ),
};
