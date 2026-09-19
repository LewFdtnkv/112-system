import { backendApi, publicBackendApi, apiEndpoints } from "@/shared/api";
import type { TokenPair, UserProfile } from "../model/types";
export interface LoginRequest {
  username: string;
  password: string;
}
export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}
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
