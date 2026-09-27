import { backendApi } from "@/shared/api";
import type { CatalogRule, CatalogVersion } from "../types/profile";
import type { Classifier, Service } from "../types/catalog";
import type { Page } from "@/shared/types/pagination";
import type { Params } from "@/shared/types/query";
import {
  apiGet as get,
  apiId as id,
  apiPost as post,
} from "@/shared/api/apiClient";

/** Classifier catalog import, versioning, rules and admin reference data. */
export const catalogApi = {
  import: (text: string) =>
    backendApi
      .post("admin/classifiers/import", {
        body: text,
        headers: { "Content-Type": "application/json" },
      })
      .json<CatalogVersion>(),
  export: (versionId: string) =>
    backendApi.get(`admin/classifiers/${id(versionId)}/export`).blob(),
  clone: (versionId: string, label: string) =>
    post<CatalogVersion>(`admin/classifiers/${id(versionId)}/versions`, {
      label,
    }),
  rules: (versionId: string, params: Params, signal?: AbortSignal) =>
    get<
      Page<{ id: string; code: string; name: string; section: string }> & {
        version: CatalogVersion;
      }
    >(`admin/classifiers/${id(versionId)}/entries`, params, signal),
  rule: (versionId: string, entryId: string, signal?: AbortSignal) =>
    get<{ revision: number; entry: CatalogRule }>(
      `admin/classifiers/${id(versionId)}/entries/${id(entryId)}`,
      {},
      signal,
    ),
  updateRule: (
    versionId: string,
    entryId: string,
    revision: number,
    entry: CatalogRule,
  ) =>
    backendApi
      .put(`admin/classifiers/${id(versionId)}/entries/${id(entryId)}`, {
        json: { expected_revision: revision, entry },
      })
      .json<CatalogVersion>(),
  services: (params: Params, signal?: AbortSignal) =>
    get<Page<Service>>("views/admin/services", params, signal),
  classifiers: (params: Params, signal?: AbortSignal) =>
    get<Page<Classifier>>("views/admin/classifiers", params, signal),
  updateService: (
    serviceId: string,
    body: { name: string; short_name: string | null },
  ) =>
    backendApi
      .patch(`admin/services/${id(serviceId)}`, { json: body })
      .json<Service>(),
  createService: (body: {
    code: string;
    name: string;
    short_name?: string | null;
  }) => post<Service>("admin/services", body),
  publishClassifier: (versionId: string) =>
    post<Classifier>(`admin/classifiers/${id(versionId)}/publish`, {}),
};
