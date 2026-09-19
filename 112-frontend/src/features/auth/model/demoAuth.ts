import { authApi } from "@/entities/user";
import { getApiError } from "@/shared/api";
import type { AuthSession } from "@/entities/user";

export const demoPassword = "demo112";

export type SignInResult =
  { success: true; session: AuthSession } | { success: false; message: string };

export const signInWithDemoCredentials = (
  email: string,
  password: string,
): Promise<SignInResult> =>
  authApi
    .login({ email, password })
    .then(({ session }): SignInResult => ({ success: true, session }))
    .catch((error: unknown) => {
      const apiError = getApiError(error);
      if (apiError.kind === "http" && apiError.status === 401) {
        return {
          success: false,
          message: "Проверьте электронную почту и пароль.",
        } satisfies SignInResult;
      }

      return {
        success: false,
        message: apiError.message,
      } satisfies SignInResult;
    });
