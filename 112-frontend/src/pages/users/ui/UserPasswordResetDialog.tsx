import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
} from "@mui/material";
import { useForm } from "react-hook-form";
import { ValidatedForm, ValidatedTextField } from "@/shared/ui/form-validation";
import { useResetUserPassword } from "../model/useResetUserPassword";
import type {
  PasswordResetValues,
  UserPasswordResetDialogProps,
} from "../types/UserDetailsDialog";

export function UserPasswordResetDialog({
  user,
  onClose,
}: UserPasswordResetDialogProps) {
  const resetPassword = useResetUserPassword(user.id);
  const { register, getValues, handleSubmit, reset } =
    useForm<PasswordResetValues>({
      defaultValues: { temporary_password: "", confirmation: "" },
    });
  const { ref: passwordRef, ...passwordField } = register("temporary_password");
  const { ref: confirmationRef, ...confirmationField } =
    register("confirmation");
  return (
    <Dialog
      open
      onClose={() => !resetPassword.isPending && onClose()}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { "aria-labelledby": "password-reset-title" } }}
    >
      <DialogTitle id="password-reset-title">
        Сброс пароля · {user.username}
      </DialogTitle>
      <DialogContent>
        {resetPassword.isSuccess ? (
          <Stack spacing={2}>
            <Alert severity="success">
              Пароль сброшен. Передайте пользователю заданный временный пароль.
              При входе он обязательно заменит его своим.
            </Alert>
            <Button onClick={onClose}>Готово</Button>
          </Stack>
        ) : (
          <ValidatedForm
            spacing={2}
            error={resetPassword.error}
            validate={() =>
              getValues("temporary_password") !== getValues("confirmation")
                ? [{ path: "confirmation", message: "Пароли не совпадают." }]
                : []
            }
            onSubmit={handleSubmit((values) =>
              resetPassword.mutate(values.temporary_password, {
                onSuccess: () => reset(),
              }),
            )}
          >
            <Alert severity="info">
              Все сеансы пользователя будут завершены. До смены временного
              пароля он не сможет работать в системе.
            </Alert>
            <ValidatedTextField
              {...passwordField}
              inputRef={passwordRef}
              label="Временный пароль"
              type="password"
              autoComplete="new-password"
              required
              autoFocus
              disabled={resetPassword.isPending}
              slotProps={{ htmlInput: { minLength: 12, maxLength: 128 } }}
              helperText="От 12 до 128 символов. Передайте пароль пользователю."
            />
            <ValidatedTextField
              {...confirmationField}
              inputRef={confirmationRef}
              label="Повторите временный пароль"
              type="password"
              autoComplete="new-password"
              required
              disabled={resetPassword.isPending}
              slotProps={{ htmlInput: { minLength: 12, maxLength: 128 } }}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={resetPassword.isPending}
            >
              {resetPassword.isPending
                ? "Сбрасываем пароль…"
                : "Сбросить пароль"}
            </Button>
            <Button onClick={onClose} disabled={resetPassword.isPending}>
              Отмена
            </Button>
          </ValidatedForm>
        )}
      </DialogContent>
    </Dialog>
  );
}
