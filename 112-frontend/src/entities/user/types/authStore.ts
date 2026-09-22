import type { AuthSession } from "./types";
export interface AuthActions {
  initializationError?: string;
  startChecking: () => void;
  setSession: (session: AuthSession) => void;
  requirePassword: () => void;
  clearSession: () => void;
}
