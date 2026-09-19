import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { AuthSession, AuthState } from "./types";

interface AuthActions {
  startChecking: () => void;
  setSession: (session: AuthSession) => void;
  clearSession: () => void;
}

export const authStorageKey = "dds112-auth";

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      status: "anonymous",
      session: null,
      startChecking: () => set({ status: "checking", session: null }),
      setSession: (session) => set({ status: "authenticated", session }),
      clearSession: () => set({ status: "anonymous", session: null }),
    }),
    {
      name: authStorageKey,
      version: 1,
      partialize: (state) => ({ session: state.session }),
      merge: (persistedState, currentState) => {
        const session = (persistedState as Partial<AuthState>).session ?? null;

        return session
          ? { ...currentState, status: "authenticated", session }
          : currentState;
      },
    },
  ),
);
