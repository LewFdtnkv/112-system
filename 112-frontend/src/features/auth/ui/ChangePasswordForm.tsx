import { Alert, Button, Stack, TextField } from "@mui/material";
import { useForm } from "react-hook-form";
import type {
  ChangePasswordFormProps,
  ChangePasswordValues,
} from "../types/ChangePasswordForm";
export const ChangePasswordForm = ({
  error,
  onSubmit,
}: ChangePasswordFormProps) => {
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>();
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
        label="Текущий пароль"
        type="password"
        autoComplete="current-password"
        {...register("currentPassword", {
          required: "Введите текущий пароль.",
        })}
        error={Boolean(errors.currentPassword)}
        helperText={errors.currentPassword?.message}
      />
      <TextField
        variant="standard"
        slotProps={{ inputLabel: { shrink: true } }}
        label="Новый пароль"
        type="password"
        autoComplete="new-password"
        {...register("newPassword", {
          required: "Введите новый пароль.",
          minLength: { value: 12, message: "Не менее 12 символов." },
          maxLength: { value: 128, message: "Не более 128 символов." },
          validate: (value) =>
            (!!value.trim() && value !== getValues("currentPassword")) ||
            "Новый пароль должен отличаться от текущего и не состоять из пробелов.",
        })}
        error={Boolean(errors.newPassword)}
        helperText={errors.newPassword?.message ?? "От 12 до 128 символов."}
      />
      <TextField
        variant="standard"
        slotProps={{ inputLabel: { shrink: true } }}
        label="Повторите новый пароль"
        type="password"
        autoComplete="new-password"
        {...register("confirmation", {
          required: "Повторите пароль.",
          validate: (value) =>
            value === getValues("newPassword") || "Пароли не совпадают.",
        })}
        error={Boolean(errors.confirmation)}
        helperText={errors.confirmation?.message}
      />
      <Button type="submit" disabled={isSubmitting}>
        Сохранить пароль
      </Button>
    </Stack>
  );
};

export type { ChangePasswordValues } from "../types/ChangePasswordForm";
