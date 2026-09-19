import { useState } from "react";
import { Alert, Button, Stack } from "@mui/material";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { changePassword, signOut, useAuthStore } from "@/entities/user";
import {
  authErrorMessage,
  ChangePasswordForm,
  type ChangePasswordValues,
} from "@/features/auth";
import { routePaths } from "@/shared/config/routes";
import { PageHeader } from "@/shared/ui/PageHeader";
import { safeReturnPath } from "@/shared/lib/safeReturnPath";
export const ChangePasswordPage = () => {
  const status = useAuthStore((state) => state.status);
  const [error, setError] = useState<string>();
  const navigate = useNavigate();
  const location = useLocation();
  if (status === "anonymous") return <Navigate to={routePaths.login} replace />;
  if (status === "authenticated")
    return <Navigate to={safeReturnPath(location.state?.from)} replace />;
  const submit = async (values: ChangePasswordValues) => {
    setError(undefined);
    try {
      await changePassword({
        current_password: values.currentPassword,
        new_password: values.newPassword,
      });
      navigate(safeReturnPath(location.state?.from), { replace: true });
    } catch (error) {
      setError(authErrorMessage(error, true));
    }
  };
  return (
    <Stack spacing={2}>
      <PageHeader title="Смена пароля" />
      <Alert severity="info">
        Перед началом работы замените стартовый пароль на свой.
      </Alert>
      <ChangePasswordForm error={error} onSubmit={submit} />
      <Button onClick={() => void signOut().catch(() => undefined)}>
        Выйти
      </Button>
    </Stack>
  );
};
