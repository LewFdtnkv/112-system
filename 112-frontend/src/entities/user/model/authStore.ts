import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AuthActions } from "../types/authStore";
import type { AuthState, TokenPair } from "../types/types";
export const tokenStorageKey = "dds112-tokens-v1";

const isTokenPair = (value: unknown): value is TokenPair => {
  if (!value || typeof value !== "object") return false;
  const pair = value as Partial<TokenPair>;
  return (
    typeof pair.access_token === "string" &&
    typeof pair.refresh_token === "string" &&
    typeof pair.must_change_password === "boolean"
  );
};

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      status: "anonymous",
      session: null,
      tokens: null,
      generation: 0,
      setTokens: (tokens) => set({ tokens }),
      startChecking: () =>
        set({
          status: "checking",
          session: null,
          initializationError: undefined,
        }),
      setSession: (session) =>
        set({
          status: "authenticated",
          session,
          initializationError: undefined,
        }),
      requirePassword: () =>
        set({
          status: "password-required",
          session: null,
          initializationError: undefined,
        }),
      clearSession: () => {
        set((state) => ({
          generation: state.generation + 1,
          tokens: null,
          status: "anonymous",
          session: null,
          initializationError: undefined,
        }));
        useAuthStore.persist.clearStorage();
      },
    }),
    {
      name: tokenStorageKey,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ tokens: state.tokens }),
      merge: (persisted, current) => {
        const candidate = (persisted as { tokens?: unknown } | undefined)
          ?.tokens;
        const tokens = isTokenPair(candidate) ? candidate : null;
        // Only tokens are restored. Permissions always come from users/me.
        return {
          ...current,
          tokens,
          session: null,
          status: tokens ? "checking" : "anonymous",
        };
      },
    },
  ),
);

export const getTokens = () => useAuthStore.getState().tokens;
export const getAuthGeneration = () => useAuthStore.getState().generation;
export const saveTokens = (value: TokenPair) =>
  useAuthStore.getState().setTokens(value);
