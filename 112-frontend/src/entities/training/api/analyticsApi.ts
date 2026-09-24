import type { Analytics } from "../model/types";
import type { Params } from "../types/trainingApi";
import { apiGet as get } from "./apiClient";

/** Aggregate analytics and administrator dashboard counters. */
export const analyticsApi = {
  get: (params: Params, signal?: AbortSignal) =>
    get<Analytics>("views/analytics", params, signal),
  adminSummary: (signal?: AbortSignal) =>
    get<{ users: number; services: number; classifiers: number }>(
      "views/admin/dashboard",
      {},
      signal,
    ),
};
