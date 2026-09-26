import { getApiError } from "@/shared/api";
import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import { ValidatedForm } from "@/shared/ui/form-validation";
import {
  activityApi,
  userApi,
  UserPhoto,
  type UserUpdate,
} from "@/entities/training";
import { QueryState } from "@/shared/ui/QueryState";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { styles } from "../styles/UserDetailsDialog";
import type {
  AccountFormProps,
  UserDetailsDialogProps,
} from "../types/UserDetailsDialog";
import { UserActivityDialog } from "./UserActivityDialog";
import { UserPasswordResetDialog } from "./UserPasswordResetDialog";

import { accountDate, roleLabels } from "../model/accountDisplay";

export function UserDetailsDialog({ userId, onClose }: UserDetailsDialogProps) {
  const [resetPassword, setResetPassword] = useState(false);
  const query = useQuery({
    queryKey: ["user", userId],
    queryFn: ({ signal }) => userApi.get(userId, signal),
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Учётная запись {query.data?.username}</DialogTitle>
      <DialogContent>
        <QueryState
          pending={query.isPending}
          error={query.error}
          retry={() => void query.refetch()}
        >
          {query.data && (
            <AccountForm
              key={`${userId}:${query.data.updated_at}`}
              user={query.data}
              onClose={onClose}
              onResetPassword={() => setResetPassword(true)}
            />
          )}
        </QueryState>
      </DialogContent>
      {resetPassword && query.data && (
        <UserPasswordResetDialog
          user={query.data}
          onClose={() => setResetPassword(false)}
        />
      )}
    </Dialog>
  );
}

function AccountForm({ user, onClose, onResetPassword }: AccountFormProps) {
  const [form, setForm] = useState<UserUpdate>({
    first_name: user.first_name,
    last_name: user.last_name,
    middle_name: user.middle_name,
    email: user.email,
    is_active: user.is_active,
  });
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [history, setHistory] = useState(false);
  const accessChanged = form.is_active !== user.is_active;
  const client = useQueryClient();
  const upload = useMutation({
    mutationFn: (file: File) => activityApi.uploadPhoto(user.id, file),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["user-photo", user.id] });
    },
  });
  const save = useMutation({
    mutationFn: () =>
      userApi.update(user.id, {
        ...form,
        ...(accessChanged ? { reason } : {}),
        email: form.email?.trim() || null,
        middle_name: form.middle_name?.trim() || null,
      }),
    onSuccess: () => {
      for (const key of ["users", "user", "student-options", "admin-summary"])
        void client.invalidateQueries({ queryKey: [key] });
      onClose();
    },
  });
  return (
    <ValidatedForm
      error={save.error}
      spacing={2}
      sx={styles.stack}
      onSubmit={(e) => {
        e.preventDefault();
        if (accessChanged) setConfirm(true);
        else save.mutate();
      }}
    >
      <UserPhoto userId={user.id} />
      <Button component="label" disabled={upload.isPending}>
        Загрузить фотографию
        <input
          type="file"
          hidden
          accept="image/png,image/jpeg"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
            e.target.value = "";
          }}
        />
      </Button>
      {upload.error && (
        <Alert severity="error">{getApiError(upload.error).message}</Alert>
      )}
      <Button onClick={() => setHistory(true)}>История действий</Button>
      <Button onClick={onResetPassword} variant="outlined">
        Сбросить пароль
      </Button>
      {history && (
        <UserActivityDialog
          userId={user.id}
          onClose={() => setHistory(false)}
        />
      )}
      <Dialog
        open={confirm}
        onClose={() => !save.isPending && setConfirm(false)}
        fullWidth
      >
        <DialogTitle>Подтвердите изменение доступа</DialogTitle>
        <DialogContent>
          <ValidatedForm
            error={save.error}
            spacing={2}
            sx={styles.stack2}
            onSubmit={() => save.mutate()}
          >
            <TextField
              autoFocus
              name="reason"
              label="Причина изменения доступа"
              required
              multiline
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
            />
            <Button disabled={save.isPending} type="submit">
              Подтвердить
            </Button>
            <Button onClick={() => setConfirm(false)} disabled={save.isPending}>
              Отмена
            </Button>
          </ValidatedForm>
        </DialogContent>
      </Dialog>
      <TextField
        label="Логин"
        value={user.username}
        slotProps={{ input: { readOnly: true } }}
      />
      {(
        [
          ["last_name", "Фамилия"],
          ["first_name", "Имя"],
          ["middle_name", "Отчество"],
          ["email", "Email"],
        ] as const
      ).map(([key, label]) => (
        <TextField
          name={key}
          key={key}
          label={label}
          value={form[key] ?? ""}
          type={key === "email" ? "email" : "text"}
          slotProps={{ htmlInput: { maxLength: key === "email" ? 254 : 100 } }}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      ))}
      <TextField
        label="Роль пользователя"
        value={roleLabels[user.role]}
        slotProps={{ input: { readOnly: true } }}
        helperText="Роль задаётся при создании. Для другой роли создайте нового пользователя."
      />
      <FormControlLabel
        label="Аккаунт активен"
        control={
          <Switch
            checked={form.is_active}
            onChange={(_, checked) => setForm({ ...form, is_active: checked })}
          />
        }
      />
      {accessChanged && (
        <Alert severity="info">
          При изменении доступа текущие сеансы пользователя будут завершены.
        </Alert>
      )}
      <Stack spacing={0.5}>
        <Typography variant="body2">
          Последний вход:{" "}
          {user.last_login_at
            ? accountDate(user.last_login_at)
            : "Ещё не входил"}
        </Typography>
        <Typography variant="body2">
          Создан: {accountDate(user.created_at)}
        </Typography>
        <Typography variant="body2">
          Изменён: {accountDate(user.updated_at)}
        </Typography>
        <Typography variant="body2">
          Пароль изменён: {accountDate(user.password_changed_at)}
        </Typography>
        <Typography variant="body2">
          Обязательная смена пароля: {user.must_change_password ? "Да" : "Нет"}
        </Typography>
        <Typography variant="caption" sx={styles.typography}>
          ID: {user.id} · Время московское
        </Typography>
      </Stack>
      <Button type="submit" disabled={save.isPending}>
        Сохранить изменения
      </Button>
      <Button onClick={onClose} disabled={save.isPending}>
        Закрыть
      </Button>
    </ValidatedForm>
  );
}
