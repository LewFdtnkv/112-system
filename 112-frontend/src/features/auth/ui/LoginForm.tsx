import { Alert, Button, Stack, TextField } from "@mui/material";
import LoginIcon from "@mui/icons-material/Login";
import { useForm } from "react-hook-form";

export interface LoginValues {
  email: string;
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
  } = useForm<LoginValues>({ defaultValues: { email: "", password: "" } });

  return (
    <Stack
      component="form"
      spacing={2}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      {error && <Alert severity="error">{error}</Alert>}
      <TextField
        label="Электронная почта"
        type="email"
        autoComplete="email"
        {...register("email", {
          required: "Укажите электронную почту.",
          pattern: {
            value: /^\S+@\S+\.\S+$/,
            message: "Введите корректный адрес.",
          },
        })}
        error={Boolean(errors.email)}
        helperText={errors.email?.message}
      />
      <TextField
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
