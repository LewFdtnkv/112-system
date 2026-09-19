import { api, apiEndpoints } from "@/shared/api";

import type { DemoUser } from "../model/demoUsers";
import type { AuthSession } from "../model/types";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  session: AuthSession;
}

export const authApi = {
  login: (payload: LoginRequest) =>
    api.post(apiEndpoints.auth.login, { json: payload }).json<LoginResponse>(),
  logout: () => api.post(apiEndpoints.auth.logout),
  getCurrentUser: () => api.get(apiEndpoints.auth.me).json<DemoUser>(),
};
