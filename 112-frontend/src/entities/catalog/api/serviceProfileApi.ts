import { backendApi } from "@/shared/api";
import type { ProfileInput, ServiceProfile } from "../types/profile";
import type { Page } from "@/shared/types/pagination";
import type { Params } from "@/shared/types/query";
import {
  apiGet as get,
  apiId as id,
  apiPost as post,
} from "@/shared/api/apiClient";

/** Public and administrator service-profile operations. */
export const serviceProfileApi = {
  get: (profileId: string, signal?: AbortSignal) =>
    get<ServiceProfile>(`service-profiles/${id(profileId)}`, {}, signal),
  list: (q: string, signal?: AbortSignal) =>
    get<{ id: string; name: string }[]>(
      "service-profiles",
      { q, limit: 20 },
      signal,
    ),
  adminList: (params: Params, signal?: AbortSignal) =>
    get<Page<ServiceProfile>>("admin/service-profiles", params, signal),
  adminGet: (profileId: string, signal?: AbortSignal) =>
    get<ServiceProfile>(`admin/service-profiles/${id(profileId)}`, {}, signal),
  create: (data: ProfileInput) =>
    post<ServiceProfile>("admin/service-profiles", data),
  update: (profileId: string, data: ProfileInput, revision: number) =>
    backendApi
      .put(`admin/service-profiles/${id(profileId)}`, {
        json: { ...data, expected_revision: revision },
      })
      .json<ServiceProfile>(),
  publish: (profileId: string) =>
    post<ServiceProfile>(`admin/service-profiles/${id(profileId)}/publish`, {}),
};
