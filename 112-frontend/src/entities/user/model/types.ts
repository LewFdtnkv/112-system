export interface AuthSession {
  userId: string;
  roles: readonly string[];
}

export type AuthState =
  | { status: "anonymous" | "checking"; session: null }
  | { status: "authenticated"; session: AuthSession };
