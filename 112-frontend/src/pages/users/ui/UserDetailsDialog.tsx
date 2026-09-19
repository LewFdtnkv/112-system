import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Switch,
  FormControlLabel,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  trainingApi,
  type UserDetail,
  type UserUpdate,
  type UserRole,
} from "@/entities/training";
import { getApiError } from "@/shared/api";
import { QueryState } from "@/shared/ui/QueryState";

import { roleLabels, accountDate } from "../model/accountDisplay";

export function UserDetailsDialog({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ["user", userId],
    queryFn: ({ signal }) => trainingApi.user(userId, signal),
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
            />
          )}
        </QueryState>
      </DialogContent>
    </Dialog>
  );
}

function AccountForm({
  user,
  onClose,
}: {
  user: UserDetail;
  onClose: () => void;
}) {
  const [form, setForm] = useState<UserUpdate>({
    first_name: user.first_name,
    last_name: user.last_name,
    middle_name: user.middle_name,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
  });
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      trainingApi.updateUser(user.id, {
        ...form,
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
    <Stack
      component="form"
      spacing={2}
      sx={{ pt: 1 }}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
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
          key={key}
          label={label}
          value={form[key] ?? ""}
          type={key === "email" ? "email" : "text"}
          slotProps={{ htmlInput: { maxLength: key === "email" ? 254 : 100 } }}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      ))}
      <TextField
        select
        label="Роль пользователя"
        value={form.role}
        onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
      >
        {Object.entries(roleLabels).map(([value, label]) => (
          <MenuItem key={value} value={value}>
            {label}
          </MenuItem>
        ))}
      </TextField>
      <FormControlLabel
        label="Аккаунт активен"
        control={
          <Switch
            checked={form.is_active}
            onChange={(_, checked) => setForm({ ...form, is_active: checked })}
          />
        }
      />
      {(form.role !== user.role || form.is_active !== user.is_active) && (
        <Alert severity="info">
          При изменении роли или состояния текущие сеансы пользователя будут
          завершены.
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
        <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>
          ID: {user.id} · Время московское
        </Typography>
      </Stack>
      {save.error && (
        <Alert severity="error">{getApiError(save.error).message}</Alert>
      )}
      <Button type="submit" disabled={save.isPending}>
        Сохранить изменения
      </Button>
      <Button onClick={onClose} disabled={save.isPending}>
        Закрыть
      </Button>
    </Stack>
  );
}
