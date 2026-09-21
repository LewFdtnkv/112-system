import { create } from "zustand";
import type { AuthActions } from "../types/authStore";
import type { AuthState, TokenPair } from "../types/types";

export const authStorageKey = "dds112-auth";
export const tokenStorageKey = "dds112-tokens-v1";
// The prototype's persisted roles must never authorize a real account.
localStorage.removeItem(authStorageKey);
const readTokens = (): TokenPair | null => {
  try {
    const data = JSON.parse(sessionStorage.getItem(tokenStorageKey) ?? "null");
    return data &&
      typeof data.access_token === "string" &&
      typeof data.refresh_token === "string" &&
      typeof data.must_change_password === "boolean"
      ? data
      : null;
  } catch {
    return null;
  }
};
let tokens = readTokens();
let generation = 0;
export const getTokens = () => tokens;
export const getAuthGeneration = () => generation;
export const saveTokens = (value: TokenPair) => {
  tokens = value;
  sessionStorage.setItem(tokenStorageKey, JSON.stringify(value));
};
export const useAuthStore = create<AuthState & AuthActions>()((set) => ({
  status: tokens ? "checking" : "anonymous",
  session: null,
  startChecking: () =>
    set({ status: "checking", session: null, initializationError: undefined }),
  setSession: (session) =>
    set({ status: "authenticated", session, initializationError: undefined }),
  requirePassword: () =>
    set({
      status: "password-required",
      session: null,
      initializationError: undefined,
    }),
  clearSession: () => {
    generation++;
    tokens = null;
    sessionStorage.removeItem(tokenStorageKey);
    localStorage.removeItem(authStorageKey);
    set({ status: "anonymous", session: null, initializationError: undefined });
  },
}));
