import { userName } from "@/entities/training";
import { rowAction } from "@/shared/lib/rowAction";
import { PageControls } from "@/shared/ui/QueryState";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { accountDate, roleLabels } from "../model/accountDisplay";
import type { UsersTableProps } from "../types/UsersPage";

export function UsersTable({
  items,
  total,
  page,
  onPageChange,
  onSelect,
}: UsersTableProps) {
  return (
    <>
      <TableContainer>
        <Table size="small" aria-label="Пользователи">
          <TableHead>
            <TableRow>
              <TableCell>Имя / логин</TableCell>
              <TableCell>Роль</TableCell>
              <TableCell>Группы</TableCell>
              <TableCell>Состояние</TableCell>
              <TableCell>Последний вход</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((user) => (
              <TableRow key={user.id} {...rowAction(() => onSelect(user))}>
                <TableCell>
                  <Button
                    className="table-block-link"
                    onClick={() => onSelect(user)}
                  >
                    {userName(user)} ({user.username})
                  </Button>
                </TableCell>
                <TableCell>
                  {
                    roleLabels[
                      user.is_admin
                        ? "admin"
                        : user.is_teacher
                          ? "teacher"
                          : "student"
                    ]
                  }
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
                <TableCell>
                  {user.last_login_at
                    ? accountDate(user.last_login_at)
                    : "Ещё не входил"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <PageControls total={total} page={page} onPage={onPageChange} />
    </>
  );
}
