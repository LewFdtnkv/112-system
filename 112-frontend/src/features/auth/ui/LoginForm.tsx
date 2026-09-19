import { Alert, Button, Stack, TextField } from "@mui/material";
import LoginIcon from "@mui/icons-material/Login";
import { useForm } from "react-hook-form";

export interface LoginValues {
  username: string;
  password: string;
}

interface LoginFormProps {
  error?: string;
  onSubmit: (values: LoginValues) => void | Promise<void>;
}

export const LoginForm = ({ error, onSubmit }: LoginFormProps) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ defaultValues: { username: "", password: "" } });

  return (
    <Stack
      component="form"
      spacing={2}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      {error && <Alert severity="error">{error}</Alert>}
      <TextField
        variant="standard"
        slotProps={{ inputLabel: { shrink: true } }}
        label="Логин"
        type="text"
        autoComplete="username"
        {...register("username", {
          required: "Укажите логин.",
          pattern: {
            value: /^[A-Za-z0-9_.-]{1,50}$/,
            message:
              "Используйте латинские буквы, цифры, точку, дефис или подчёркивание.",
          },
        })}
        error={Boolean(errors.username)}
        helperText={errors.username?.message}
      />
      <TextField
        variant="standard"
        slotProps={{ inputLabel: { shrink: true } }}
        label="Пароль"
        type="password"
        autoComplete="current-password"
        {...register("password", { required: "Укажите пароль." })}
        error={Boolean(errors.password)}
        helperText={errors.password?.message}
      />
      <Button type="submit" startIcon={<LoginIcon />} disabled={isSubmitting}>
        Войти
      </Button>
    </Stack>
  );
};
