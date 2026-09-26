import { backendApi } from "@/shared/api";
import type {
  GroupItem,
  Page,
  UserCreate,
  UserDetail,
  UserItem,
  UserUpdate,
} from "../model/types";
import type { Params } from "../types/trainingApi";
import { apiGet as get, apiId as id } from "./apiClient";

/** User and study-group administration. */
export const userApi = {
  me: () => get<UserDetail>("users/me"),
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
