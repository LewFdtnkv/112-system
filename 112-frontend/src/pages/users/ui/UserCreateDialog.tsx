import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import { ValidatedForm } from "@/shared/ui/form-validation";
import { userApi, type UserCreate } from "@/entities/training";
import { Button, Dialog, DialogTitle, MenuItem } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { roleLabels } from "../model/accountDisplay";
import { styles } from "../styles/UsersPage";
import type { UserCreateDialogProps } from "../types/UsersPage";

const blank: UserCreate = {
  username: "",
  initial_password: "",
  first_name: "",
  last_name: "",
  role: "student",
};
export function UserCreateDialog({ open, onClose }: UserCreateDialogProps) {
  const client = useQueryClient();
  const [form, setForm] = useState(blank);
  const update = (key: keyof UserCreate, value: string) =>
    setForm({ ...form, [key]: value });
  const close = () => {
    if (!create.isPending) {
      setForm(blank);
      onClose();
    }
  };
  const create = useMutation({
    mutationFn: () =>
      userApi.create({
        ...form,
        ...(form.email?.trim()
          ? { email: form.email.trim() }
          : { email: undefined }),
      }),
    onSuccess: () => {
      setForm(blank);
      onClose();
      void client.invalidateQueries({ queryKey: ["users"] });
      void client.invalidateQueries({ queryKey: ["student-options"] });
      void client.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
  return (
    <Dialog open={open} onClose={close} fullWidth>
      <DialogTitle>Создать пользователя</DialogTitle>
      <ValidatedForm
        error={create.error}
        spacing={2}
        sx={styles.stack}
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <TextField
          name="username"
          label="Логин"
          required
          value={form.username}
          onChange={(event) => update("username", event.target.value)}
          slotProps={{
            htmlInput: { pattern: "[A-Za-z0-9_.\\-]{1,50}", maxLength: 50 },
          }}
        />
        <TextField
          name="initial_password"
          label="Стартовый пароль"
          type="password"
          autoComplete="new-password"
          required
          value={form.initial_password}
          onChange={(event) => update("initial_password", event.target.value)}
          slotProps={{ htmlInput: { minLength: 12, maxLength: 128 } }}
          helperText="Пользователь заменит его при первом входе."
        />
        {(["last_name", "first_name", "middle_name", "email"] as const).map(
          (key) => (
            <TextField
              name={key}
              key={key}
              label={
                {
                  last_name: "Фамилия",
                  first_name: "Имя",
                  middle_name: "Отчество",
                  email: "Email (необязательно)",
                }[key]
              }
              type={key === "email" ? "email" : "text"}
              value={form[key] ?? ""}
              onChange={(event) => update(key, event.target.value)}
            />
          ),
        )}
        <TextField
          select
          label="Роль пользователя"
          value={form.role}
          onChange={(event) => update("role", event.target.value)}
        >
          {Object.entries(roleLabels).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <Button type="submit" disabled={create.isPending}>
          Создать аккаунт
        </Button>
        <Button disabled={create.isPending} onClick={close}>
          Отмена
        </Button>
      </ValidatedForm>
    </Dialog>
  );
}
