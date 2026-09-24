import { MenuItem, Stack, TextField } from "@mui/material";
import type { UserFiltersProps } from "../types/UsersPage";

const roles = {
  all: "Все роли",
  student: "Ученик",
  teacher: "Преподаватель",
  admin: "Администратор",
};
export function UserFilters({
  search,
  role,
  onSearchChange,
  onRoleChange,
}: UserFiltersProps) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
      <TextField
        label="Поиск пользователя"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <TextField
        select
        label="Роль"
        value={role}
        onChange={(event) => onRoleChange(event.target.value)}
      >
        {Object.entries(roles).map(([value, label]) => (
          <MenuItem key={value} value={value}>
            {label}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}
