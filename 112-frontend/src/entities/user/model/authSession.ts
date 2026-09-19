import { configureAuthentication, getApiError } from "@/shared/api";
import {
  authApi,
  type LoginRequest,
  type ChangePasswordRequest,
} from "../api/authApi";
import {
  getAuthGeneration,
  getTokens,
  saveTokens,
  useAuthStore,
} from "./authStore";
import type { UserProfile } from "./types";

export const sessionFromProfile = (user: UserProfile) => ({
  userId: user.id,
  username: user.username,
  name:
    [user.last_name, user.first_name, user.middle_name]
      .filter(Boolean)
      .join(" ") || user.username,
  roles: [
    ...(user.is_admin ? ["admin"] : []),
    ...(user.is_teacher ? ["teacher"] : []),
    ...(!user.is_admin && !user.is_teacher ? ["student"] : []),
  ],
});
let refreshing: Promise<void> | undefined;
let refreshingGeneration = -1;
export const refreshSession = (): Promise<void> => {
  if (refreshing && refreshingGeneration === getAuthGeneration())
    return refreshing;
  const refreshToken = getTokens()?.refresh_token;
  const generation = getAuthGeneration();
  if (!refreshToken) return Promise.resolve();
  refreshingGeneration = generation;
  const pending = authApi
    .refresh(refreshToken)
    .then((pair) => {
      if (generation !== getAuthGeneration()) return;
      saveTokens(pair);
      if (pair.must_change_password) useAuthStore.getState().requirePassword();
    })
    .catch((error: unknown) => {
      const info = getApiError(error);
      if (
        generation === getAuthGeneration() &&
        info.kind === "http" &&
        info.status === 401
      )
        useAuthStore.getState().clearSession();
      throw error;
    })
    .finally(() => {
      if (refreshing === pending) refreshing = undefined;
    });
  refreshing = pending;
  return pending;
};
configureAuthentication({
  accessToken: () => getTokens()?.access_token,
  generation: getAuthGeneration,
  refresh: refreshSession,
  expired: () => useAuthStore.getState().clearSession(),
  passwordRequired: () => useAuthStore.getState().requirePassword(),
});
const loadProfile = async (generation: number) => {
  if (getTokens()?.must_change_password) {
    useAuthStore.getState().requirePassword();
    return;
  }
  const user = await authApi.getCurrentUser();
  if (generation !== getAuthGeneration()) return;
  if (!user.is_active) {
    useAuthStore.getState().clearSession();
    return;
  }
  if (user.must_change_password) useAuthStore.getState().requirePassword();
  else useAuthStore.getState().setSession(sessionFromProfile(user));
};
export const signIn = async (payload: LoginRequest) => {
  useAuthStore.getState().clearSession();
  const generation = getAuthGeneration();
  const pair = await authApi.login(payload);
  if (generation !== getAuthGeneration()) return;
  saveTokens(pair);
  try {
    await loadProfile(generation);
  } catch (error) {
    if (useAuthStore.getState().status !== "password-required")
      useAuthStore.getState().clearSession();
    throw error;
  }
};
let restoring: Promise<void> | undefined;
export const restoreSession = (): Promise<void> => {
  if (restoring) return restoring;
  if (!getTokens()) return Promise.resolve();
  const generation = getAuthGeneration();
  useAuthStore.getState().startChecking();
  restoring = loadProfile(generation)
    .catch((error: unknown) => {
      if (
        generation !== getAuthGeneration() ||
        useAuthStore.getState().status === "password-required"
      )
        return;
      useAuthStore.setState({
        initializationError: getApiError(error).message,
      });
    })
    .finally(() => {
      restoring = undefined;
    });
  return restoring;
};
export const changePassword = async (payload: ChangePasswordRequest) => {
  const generation = getAuthGeneration();
  const pair = await authApi.changePassword(payload);
  if (generation !== getAuthGeneration()) return;
  saveTokens(pair);
  await restoreSession();
};
export const signOut = async () => {
  try {
    await authApi.logout();
  } finally {
    useAuthStore.getState().clearSession();
  }
};
