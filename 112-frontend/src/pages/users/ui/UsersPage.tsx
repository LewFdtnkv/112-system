import { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  trainingApi,
  userName,
  type UserCreate,
  type UserItem,
} from "@/entities/training";
import { getApiError } from "@/shared/api";
import { useDebounced } from "@/shared/lib/useDebounced";
import { PageHeader } from "@/shared/ui/PageHeader";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
const blank: UserCreate = {
  username: "",
  initial_password: "",
  first_name: "",
  last_name: "",
  is_admin: false,
  is_teacher: false,
};
export const UsersPage = () => {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<UserItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(blank);
  const q = useDebounced(search);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["users", q, role, page],
    queryFn: ({ signal }) =>
      trainingApi.users({ q, role, offset: page * 20 }, signal),
  });
  const create = useMutation({
    mutationFn: () =>
      trainingApi.createUser({
        ...form,
        ...(form.email?.trim()
          ? { email: form.email.trim() }
          : { email: undefined }),
      }),
    onSuccess: () => {
      setCreating(false);
      setForm(blank);
      void client.invalidateQueries({ queryKey: ["users"] });
      void client.invalidateQueries({ queryKey: ["student-options"] });
      void client.invalidateQueries({ queryKey: ["admin-summary"] });
    },
  });
  const update = (key: keyof UserCreate, value: string | boolean) =>
    setForm({ ...form, [key]: value });
  return (
    <Stack spacing={2}>
      <PageHeader
        title="Пользователи"
        actions={
          <Button
            onClick={() => {
              create.reset();
              setCreating(true);
            }}
          >
            Создать пользователя
          </Button>
        }
      />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          label="Поиск пользователя"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <TextField
          select
          label="Роль"
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(0);
          }}
        >
          {Object.entries({
            all: "Все роли",
            student: "Ученик",
            teacher: "Преподаватель",
            admin: "Администратор",
          }).map(([v, l]) => (
            <MenuItem key={v} value={v}>
              {l}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      >
        {query.data && (
          <>
            <TableContainer>
              <Table size="small" aria-label="Пользователи">
                <TableHead>
                  <TableRow>
                    <TableCell>Имя / логин</TableCell>
                    <TableCell>Права</TableCell>
                    <TableCell>Группы</TableCell>
                    <TableCell>Состояние</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {query.data.items.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <Button
                          className="table-block-link"
                          onClick={() => setSelected(user)}
                        >
                          {userName(user)} ({user.username})
                        </Button>
                      </TableCell>
                      <TableCell>
                        {[
                          user.is_teacher && "Преподаватель",
                          user.is_admin && "Администратор",
                          !user.is_teacher && !user.is_admin && "Ученик",
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </TableCell>
                      <TableCell>
                        {user.groups.join(", ") || "Не назначена"}
                      </TableCell>
                      <TableCell>
                        {!user.is_active
                          ? "Отключён"
                          : user.must_change_password
                            ? "Требуется смена пароля"
                            : "Активен"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <PageControls
              total={query.data.total}
              page={page}
              onPage={setPage}
            />
          </>
        )}
      </QueryState>
      <Dialog open={!!selected} onClose={() => setSelected(null)}>
        <DialogTitle>{selected && userName(selected)}</DialogTitle>
        <DialogContent>
          <p>Логин: {selected?.username}</p>
          <p>Email: {selected?.email || "Не указан"}</p>
          <p>Группы: {selected?.groups.join(", ") || "Не назначена"}</p>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={creating}
        onClose={() => {
          if (!create.isPending) {
            setCreating(false);
            setForm(blank);
          }
        }}
        fullWidth
      >
        <DialogTitle>Создать пользователя</DialogTitle>
        <Stack
          component="form"
          spacing={2}
          sx={{ p: 2 }}
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <TextField
            label="Логин"
            required
            value={form.username}
            onChange={(e) => update("username", e.target.value)}
            slotProps={{
              htmlInput: { pattern: "[A-Za-z0-9_.-]{1,50}", maxLength: 50 },
            }}
          />
          <TextField
            label="Стартовый пароль"
            type="password"
            autoComplete="new-password"
            required
            value={form.initial_password}
            onChange={(e) => update("initial_password", e.target.value)}
            slotProps={{ htmlInput: { minLength: 12, maxLength: 128 } }}
            helperText="Пользователь заменит его при первом входе."
          />
          <TextField
            label="Фамилия"
            value={form.last_name}
            onChange={(e) => update("last_name", e.target.value)}
          />
          <TextField
            label="Имя"
            value={form.first_name}
            onChange={(e) => update("first_name", e.target.value)}
          />
          <TextField
            label="Отчество"
            value={form.middle_name ?? ""}
            onChange={(e) => update("middle_name", e.target.value)}
          />
          <TextField
            label="Email (необязательно)"
            type="email"
            value={form.email ?? ""}
            onChange={(e) => update("email", e.target.value)}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={form.is_teacher}
                onChange={(e) => update("is_teacher", e.target.checked)}
              />
            }
            label="Преподаватель"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={form.is_admin}
                onChange={(e) => update("is_admin", e.target.checked)}
              />
            }
            label="Администратор"
          />
          {create.error && (
            <Alert severity="error">{getApiError(create.error).message}</Alert>
          )}
          <Button type="submit" disabled={create.isPending}>
            Создать аккаунт
          </Button>
          <Button
            disabled={create.isPending}
            onClick={() => {
              setCreating(false);
              setForm(blank);
            }}
          >
            Отмена
          </Button>
        </Stack>
      </Dialog>
    </Stack>
  );
};
