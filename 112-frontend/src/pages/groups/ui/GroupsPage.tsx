import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import { ValidatedForm } from "@/shared/ui/form-validation";
import { userApi, type GroupItem } from "@/entities/training";
import { GroupDisband } from "@/features/group-disband";
import { rowAction } from "@/shared/lib/rowAction";
import { PageHeader } from "@/shared/ui/PageHeader";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
import {
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { GroupMembersDialog } from "./GroupMembersDialog";

export const GroupsPage = () => {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [page, setPage] = useState(0);
  const [group, setGroup] = useState<GroupItem | null>(null);
  const groups = useQuery({
    queryKey: ["groups", page, search],
    queryFn: ({ signal }) =>
      userApi.groups({ q: search, offset: page * 20 }, signal),
  });
  const create = useMutation({
    mutationFn: () => userApi.createGroup(name),
    onSuccess: () => {
      setName("");
      void client.invalidateQueries({ queryKey: ["groups"] });
      void client.invalidateQueries({ queryKey: ["group-options"] });
    },
  });
  const openGroup = (item: GroupItem) => setGroup(item);
  return (
    <Stack spacing={2}>
      <PageHeader title="Учебные группы" />
      <TextField
        label="Поиск группы"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(0);
        }}
      />
      <ValidatedForm
        error={create.error}
        direction="row"
        spacing={2}
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <TextField
          name="name"
          label="Название группы"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" disabled={create.isPending}>
          Создать группу
        </Button>
      </ValidatedForm>
      <QueryState
        pending={groups.isPending}
        error={groups.error}
        retry={() => void groups.refetch()}
      >
        {groups.data && (
          <>
            <Table aria-label="Группы">
              <TableHead>
                <TableRow>
                  <TableCell>Группа</TableCell>
                  <TableCell>Учеников</TableCell>
                  <TableCell align="right">Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groups.data.items.map((item) => (
                  <TableRow key={item.id} {...rowAction(() => openGroup(item))}>
                    <TableCell>
                      <Button
                        className="table-block-link"
                        onClick={() => openGroup(item)}
                      >
                        {item.name}
                      </Button>
                    </TableCell>
                    <TableCell>{item.student_count}</TableCell>
                    <TableCell align="right">
                      <GroupDisband
                        group={item}
                        onDisbanded={() => setPage(0)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PageControls
              total={groups.data.total}
              page={page}
              onPage={setPage}
            />
          </>
        )}
      </QueryState>
      <GroupMembersDialog
        group={group}
        onClose={() => setGroup(null)}
        onDisbanded={() => {
          setGroup(null);
          setPage(0);
        }}
      />
    </Stack>
  );
};
