import { backendApi } from "@/shared/api";
import type { FeatureValue } from "@/shared/types/features";
import type { Recipient } from "../types/catalog";
import type {
  Classifier,
  ClassifierEntry,
  ClassifierRoute,
  Service,
} from "../types/catalog";
import type { Params } from "@/shared/types/query";
import { apiGet as get, apiId as id } from "@/shared/api/apiClient";
export const catalogLookupApi = {
  preview: (
    versionId: string,
    entryId: string,
    answers: Record<string, FeatureValue>,
    address: object,
    signal?: AbortSignal,
  ) =>
    backendApi
      .post(`classifiers/${id(versionId)}/recipients-preview`, {
        json: { classifier_entry_id: entryId, answers, address },
        signal,
      })
      .json<Recipient[]>(),
  services: (query: string, signal?: AbortSignal) =>
    get<Service[]>("services", { q: query, limit: 20 }, signal),
  classifiers: (query: string, signal?: AbortSignal) =>
    get<Classifier[]>("classifiers", { q: query, limit: 20 }, signal),
  entries: (versionId: string, params: Params, signal?: AbortSignal) =>
    get<ClassifierEntry[]>(
      `classifiers/${id(versionId)}/entries`,
      params,
      signal,
    ),
  routes: (versionId: string, entryId: string, signal?: AbortSignal) =>
    get<ClassifierRoute[]>(
      `classifiers/${id(versionId)}/entries/${id(entryId)}/routes`,
      {},
      signal,
    ),
};
