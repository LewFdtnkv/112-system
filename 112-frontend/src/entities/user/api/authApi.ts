import { apiEndpoints, backendApi, publicBackendApi } from "@/shared/api";
import type { ChangePasswordRequest, LoginRequest } from "../types/authApi";
import type { TokenPair, UserProfile } from "../types/types";
export const authApi = {
  login: (payload: LoginRequest) =>
    publicBackendApi
      .post(apiEndpoints.auth.login, { json: payload })
      .json<TokenPair>(),
  refresh: (refresh_token: string) =>
    publicBackendApi
      .post(apiEndpoints.auth.refresh, { json: { refresh_token } })
      .json<TokenPair>(),
  changePassword: (payload: ChangePasswordRequest) =>
    backendApi
      .post(apiEndpoints.auth.changePassword, { json: payload })
      .json<TokenPair>(),
  logout: () => backendApi.post(apiEndpoints.auth.logout),
  getCurrentUser: () =>
    backendApi.get(apiEndpoints.auth.me).json<UserProfile>(),
};

export type { ChangePasswordRequest, LoginRequest } from "../types/authApi";
