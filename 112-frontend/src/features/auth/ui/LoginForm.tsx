import LoginIcon from "@mui/icons-material/Login";
import { Alert, Button, Stack, TextField } from "@mui/material";
import { useLoginForm } from "../model/useLoginForm";
import type { LoginFormProps } from "../types/LoginForm";

export const LoginForm = ({ error, onSubmit }: LoginFormProps) => {
  const {
    username,
    usernameRef,
    password,
    passwordRef,
    handleSubmit,
    onKeyDown,
    formState: { errors, isSubmitting },
  } = useLoginForm();

  return (
    <Stack
      component="form"
      spacing={2}
      onSubmit={handleSubmit(onSubmit)}
      onKeyDown={onKeyDown}
      noValidate
    >
      {error && <Alert severity="error">{error}</Alert>}
      <TextField
        variant="standard"
        slotProps={{ inputLabel: { shrink: true } }}
        label="Логин"
        type="text"
        autoComplete="username"
        autoFocus
        inputRef={usernameRef}
        {...username}
        error={Boolean(errors.username)}
        helperText={errors.username?.message}
      />
      <TextField
        variant="standard"
        slotProps={{ inputLabel: { shrink: true } }}
        label="Пароль"
        type="password"
        autoComplete="current-password"
        inputRef={passwordRef}
        {...password}
        error={Boolean(errors.password)}
        helperText={errors.password?.message}
      />
      <Button type="submit" startIcon={<LoginIcon />} disabled={isSubmitting}>
        Войти
      </Button>
    </Stack>
  );
};

export type { LoginValues } from "../types/LoginForm";
