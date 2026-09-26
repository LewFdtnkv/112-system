import LoginIcon from "@mui/icons-material/Login";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import {
  Alert,
  Button,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
} from "@mui/material";
import { useState } from "react";
import { useLoginForm } from "../model/useLoginForm";
import type { LoginFormProps } from "../types/LoginForm";

export const LoginForm = ({ error, onSubmit }: LoginFormProps) => {
  const [visible, setVisible] = useState(false);
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
        label="Пароль"
        type={visible ? "text" : "password"}
        slotProps={{
          inputLabel: { shrink: true },
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  type="button"
                  aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
                  aria-pressed={visible}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setVisible((value) => !value)}
                  edge="end"
                >
                  {visible ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
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
