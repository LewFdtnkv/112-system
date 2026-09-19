import { useState } from "react";
import { Alert, Stack } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuthStore } from "@/entities/user";
import {
  LoginForm,
  signInWithDemoCredentials,
  type LoginValues,
} from "@/features/auth";
import { routePaths } from "@/shared/config/routes";
import { PageHeader } from "@/shared/ui/PageHeader";

export const LoginPage = () => {
  const [error, setError] = useState<string>();
  const setSession = useAuthStore((state) => state.setSession);
  const navigate = useNavigate();
  const location = useLocation();

  const submit = async (values: LoginValues) => {
    const result = await signInWithDemoCredentials(
      values.email,
      values.password,
    );

    if (!result.success) {
      setError(result.message);
      return;
    }

    setSession(result.session);
    const from = location.state?.from;
    const returnPath =
      typeof from?.pathname === "string" &&
      from.pathname.startsWith("/") &&
      !from.pathname.startsWith("//")
        ? `${from.pathname}${typeof from.search === "string" ? from.search : ""}${typeof from.hash === "string" ? from.hash : ""}`
        : routePaths.home;

    navigate(returnPath, { replace: true });
  };

  return (
    <Stack spacing={2}>
      <PageHeader title="Вход" />
      <Alert severity="info">Демонстрационный пароль: demo112</Alert>
      <LoginForm error={error} onSubmit={submit} />
    </Stack>
  );
};
