import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trainingApi, userName, type GroupItem } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { PageHeader } from "@/shared/ui/PageHeader";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
import { ServerSelect, type SelectOption } from "@/shared/ui/ServerSelect";
export const GroupsPage = () => {
  const [name, setName] = useState("");
  const [page, setPage] = useState(0);
  const [group, setGroup] = useState<GroupItem | null>(null);
  const [memberPage, setMemberPage] = useState(0);
  const [student, setStudent] = useState<SelectOption | null>(null);
  const client = useQueryClient();
  const groups = useQuery({
    queryKey: ["groups", page],
    queryFn: ({ signal }) => trainingApi.groups({ offset: page * 20 }, signal),
  });
  const members = useQuery({
    queryKey: ["group-members", group?.id, memberPage],
    queryFn: ({ signal }) =>
      trainingApi.users(
        { group_id: group!.id, offset: memberPage * 20 },
        signal,
      ),
    enabled: !!group,
  });
  const create = useMutation({
    mutationFn: () => trainingApi.createGroup(name),
    onSuccess: () => {
      setName("");
      void client.invalidateQueries({ queryKey: ["groups"] });
      void client.invalidateQueries({ queryKey: ["group-options"] });
    },
  });
  const add = useMutation({
    mutationFn: () => trainingApi.addStudent(group!.id, student!.id),
    onSuccess: () => {
      setStudent(null);
      void client.invalidateQueries({ queryKey: ["groups"] });
      void client.invalidateQueries({ queryKey: ["group-options"] });
      void client.invalidateQueries({ queryKey: ["group-members"] });
    },
  });
  return (
    <Stack spacing={2}>
      <PageHeader title="Учебные группы" />
      <Stack
        component="form"
        direction="row"
        spacing={2}
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <TextField
          label="Название группы"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={create.isPending}>
          Создать группу
        </Button>
      </Stack>
      {create.error && (
        <Alert severity="error">{getApiError(create.error).message}</Alert>
      )}
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
                </TableRow>
              </TableHead>
              <TableBody>
                {groups.data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Button
                        className="table-block-link"
                        onClick={() => {
                          setGroup(item);
                          setMemberPage(0);
                          add.reset();
                        }}
                      >
                        {item.name}
                      </Button>
                    </TableCell>
                    <TableCell>{item.student_count}</TableCell>
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
      <Dialog open={!!group} onClose={() => setGroup(null)} fullWidth>
        <DialogTitle>{group?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <ServerSelect
              label="Ученик"
              queryKey={["student-options"]}
              value={student}
              onChange={setStudent}
              load={async (q, signal) =>
                (await trainingApi.users({ q, role: "student" }, signal)).items
                  .filter((u) => u.is_active)
                  .map((u) => ({ id: u.id, label: userName(u) }))
              }
            />
            <Button
              disabled={!student || add.isPending}
              onClick={() => add.mutate()}
            >
              Добавить ученика
            </Button>
            {add.error && (
              <Alert severity="error">{getApiError(add.error).message}</Alert>
            )}
            <QueryState
              pending={members.isPending}
              error={members.error}
              retry={() => void members.refetch()}
            >
              {members.data && (
                <>
                  <ul>
                    {members.data.items.map((u) => (
                      <li key={u.id}>{userName(u)}</li>
                    ))}
                  </ul>
                  <PageControls
                    total={members.data.total}
                    page={memberPage}
                    onPage={setMemberPage}
                  />
                </>
              )}
            </QueryState>
            <Button onClick={() => setGroup(null)}>Закрыть</Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </Stack>
  );
};
