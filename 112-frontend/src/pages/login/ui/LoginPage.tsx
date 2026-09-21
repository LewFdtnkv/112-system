import { signIn, useAuthStore } from "@/entities/user";
import { LoginForm, authErrorMessage, type LoginValues } from "@/features/auth";
import { routePaths } from "@/shared/config/routes";
import { safeReturnPath } from "@/shared/lib/safeReturnPath";
import { PageHeader } from "@/shared/ui/PageHeader";
import { Stack } from "@mui/material";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
export const LoginPage = () => {
  const [error, setError] = useState<string>();
  const status = useAuthStore((state) => state.status);
  const navigate = useNavigate();
  const location = useLocation();
  if (status === "password-required")
    return (
      <Navigate to={routePaths.changePassword} replace state={location.state} />
    );
  if (status === "authenticated")
    return <Navigate to={safeReturnPath(location.state?.from)} replace />;
  const submit = async (values: LoginValues) => {
    setError(undefined);
    try {
      await signIn({
        username: values.username.trim().toLowerCase(),
        password: values.password,
      });
      navigate(
        useAuthStore.getState().status === "password-required"
          ? routePaths.changePassword
          : safeReturnPath(location.state?.from),
        { replace: true, state: location.state },
      );
    } catch (error) {
      setError(authErrorMessage(error));
    }
  };
  return (
    <Stack spacing={2}>
      <PageHeader title="Вход" />
      <LoginForm error={error} onSubmit={submit} />
    </Stack>
  );
};
