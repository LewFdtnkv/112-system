import type { Page } from "@/shared/types/pagination";
import { backendApi } from "@/shared/api";
import type {
  GroupItem,
  UserCreate,
  UserDetail,
  UserItem,
  UserUpdate,
} from "../types/user";
import type { Params } from "@/shared/types/query";
import { apiGet as get, apiId as id } from "@/shared/api/apiClient";

/** User and study-group administration. */
export const userApi = {
  remove: (group: string, student: string) =>
    backendApi.delete(`groups/${group}/students/${student}`),
  transfer: (group: string, student: string, target: string) =>
    backendApi.post(`groups/${group}/students/${student}/transfer`, {
      json: { target_group_id: target },
    }),

  photo: (id: string, signal?: AbortSignal) =>
    backendApi.get(`users/${id}/photo`, { signal }).blob(),
  uploadPhoto: (id: string, file: File) =>
    backendApi.put(`admin/users/${id}/photo`, { body: file }),

  me: () => get<UserDetail>("users/me"),
  updateMe: (
    body: Pick<UserUpdate, "first_name" | "last_name" | "middle_name">,
  ) => backendApi.patch("users/me", { json: body }).json<UserDetail>(),
  uploadMyPhoto: (file: File) =>
    backendApi.put("users/me/photo", { body: file }),
  users: (params: Params, signal?: AbortSignal) =>
    get<Page<UserItem>>("views/users", params, signal),
  create: (body: UserCreate) =>
    backendApi.post("users", { json: body }).json<UserDetail>(),
  get: (userId: string, signal?: AbortSignal) =>
    get<UserDetail>(`users/${id(userId)}`, {}, signal),
  update: (userId: string, body: UserUpdate) =>
    backendApi.patch(`users/${id(userId)}`, { json: body }).json<UserDetail>(),
  resetPassword: (userId: string, temporaryPassword: string) =>
    backendApi
      .post(`users/${id(userId)}/reset-password`, {
        json: { temporary_password: temporaryPassword },
      })
      .json<UserDetail>(),
  groups: (params: Params, signal?: AbortSignal) =>
    get<Page<GroupItem>>("views/groups", params, signal),
  createGroup: (name: string) =>
    backendApi.post("groups", { json: { name } }).json<GroupItem>(),
  disbandGroup: (groupId: string) =>
    backendApi.post(`groups/${id(groupId)}/disband`),
  addStudent: (groupId: string, studentId: string) =>
    backendApi.put(`groups/${id(groupId)}/students/${id(studentId)}`),
};
