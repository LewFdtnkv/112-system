import type { AuthSession, TokenPair } from "./types";
export interface AuthActions {
  tokens: TokenPair | null;
  generation: number;
  setTokens: (tokens: TokenPair) => void;
  initializationError?: string;
  startChecking: () => void;
  setSession: (session: AuthSession) => void;
  requirePassword: () => void;
  clearSession: () => void;
}
