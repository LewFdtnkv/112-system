import { useId, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
} from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";

import { demoUsers, userRoleLabels } from "@/entities/user";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";

export const UsersPage = () => {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dialogTitleId = useId();
  const selectedUser = demoUsers.find((user) => user.id === selectedId);
  const query = search.trim().toLocaleLowerCase("ru-RU");
  const users = demoUsers.filter(
    (user) =>
      (role === "all" || user.role === role) &&
      `${user.name} ${user.email} ${user.group ?? ""}`
        .toLocaleLowerCase("ru-RU")
        .includes(query),
  );

  return (
    <Stack spacing={2}>
      <PageHeader title="Пользователи" />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          label="Поиск пользователя"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <TextField
          label="Роль"
          select
          value={role}
          onChange={(event) => setRole(event.target.value)}
        >
          <MenuItem value="all">Все роли</MenuItem>
          {Object.entries(userRoleLabels).map(([value, label]) => (
            <MenuItem value={value} key={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      {users.length ? (
        <TableContainer>
          <Table size="small" aria-label="Пользователи">
            <TableHead>
              <TableRow>
                <TableCell>Имя</TableCell>
                <TableCell>Роль</TableCell>
                <TableCell>Группа</TableCell>
                <TableCell>Карточка</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell component="th" scope="row">
                    {user.name}
                  </TableCell>
                  <TableCell>{userRoleLabels[user.role]}</TableCell>
                  <TableCell>{user.group ?? "Не назначена"}</TableCell>
                  <TableCell>
                    <Tooltip title="Открыть карточку">
                      <IconButton
                        aria-label={`Карточка: ${user.name}`}
                        onClick={() => setSelectedId(user.id)}
                      >
                        <VisibilityIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <EmptyState
          title="Пользователи не найдены"
          action={
            <Button
              onClick={() => {
                setSearch("");
                setRole("all");
              }}
            >
              Сбросить фильтры
            </Button>
          }
        />
      )}
      <Dialog
        open={Boolean(selectedUser)}
        onClose={() => setSelectedId(null)}
        aria-labelledby={dialogTitleId}
      >
        <DialogTitle id={dialogTitleId}>{selectedUser?.name}</DialogTitle>
        <DialogContent>
          {selectedUser && (
            <dl>
              <dt>Электронная почта</dt>
              <dd>{selectedUser.email}</dd>
              <dt>Роль</dt>
              <dd>{userRoleLabels[selectedUser.role]}</dd>
              <dt>Группа</dt>
              <dd>{selectedUser.group ?? "Не назначена"}</dd>
            </dl>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedId(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};
