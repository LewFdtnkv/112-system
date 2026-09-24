import { userApi, type UserItem } from "@/entities/training";
import { AccountStatistics } from "@/features/account-statistics";
import { useDebounced } from "@/shared/lib/useDebounced";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryState } from "@/shared/ui/QueryState";
import { Button, Stack } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { UserCreateDialog } from "./UserCreateDialog";
import { UserDetailsDialog } from "./UserDetailsDialog";
import { UserFilters } from "./UserFilters";
import { UsersTable } from "./UsersTable";

export const UsersPage = () => {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<UserItem | null>(null);
  const [creating, setCreating] = useState(false);
  const queryText = useDebounced(search);
  const query = useQuery({
    queryKey: ["users", queryText, role, page],
    queryFn: ({ signal }) =>
      userApi.users({ q: queryText, role, offset: page * 20 }, signal),
  });
  return (
    <Stack spacing={2}>
      <AccountStatistics />
      <PageHeader
        title="Пользователи"
        actions={
          <Button onClick={() => setCreating(true)}>
            Создать пользователя
          </Button>
        }
      />
      <UserFilters
        search={search}
        role={role}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(0);
        }}
        onRoleChange={(value) => {
          setRole(value);
          setPage(0);
        }}
      />
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      >
        {query.data && (
          <UsersTable
            items={query.data.items}
            total={query.data.total}
            page={page}
            onPageChange={setPage}
            onSelect={setSelected}
          />
        )}
      </QueryState>
      {selected && (
        <UserDetailsDialog
          userId={selected.id}
          onClose={() => setSelected(null)}
        />
      )}
      <UserCreateDialog open={creating} onClose={() => setCreating(false)} />
    </Stack>
  );
};
