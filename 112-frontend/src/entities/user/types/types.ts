export interface AuthSession {
  userId: string;
  roles: readonly string[];
  name?: string;
  username?: string;
}

export type AuthState =
  | { status: "anonymous" | "checking" | "password-required"; session: null }
  | { status: "authenticated"; session: AuthSession };

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  must_change_password: boolean;
}
export interface UserProfile {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  email: string | null;
  is_active: boolean;
  is_teacher: boolean;
  is_admin: boolean;
  must_change_password: boolean;
}
