import { Link } from "react-router-dom";
import { MessageComposer } from "@/features/teaching-messages";
import { StudentProfileDialog } from "@/features/student-profile";
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
import {
  activityApi,
  trainingApi,
  userName,
  type GroupItem,
} from "@/entities/training";
import { getApiError } from "@/shared/api";
import { PageHeader } from "@/shared/ui/PageHeader";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
import { ServerSelect, type SelectOption } from "@/shared/ui/ServerSelect";
export const GroupsPage = () => {
  const [search, setSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [profile, setProfile] = useState<string | null>(null);
  const [moveStudent, setMoveStudent] = useState<string | null>(null);
  const [target, setTarget] = useState<SelectOption | null>(null);
  const [name, setName] = useState("");
  const [page, setPage] = useState(0);
  const [group, setGroup] = useState<GroupItem | null>(null);
  const [memberPage, setMemberPage] = useState(0);
  const [student, setStudent] = useState<SelectOption | null>(null);
  const client = useQueryClient();
  const groups = useQuery({
    queryKey: ["groups", page, search],
    queryFn: ({ signal }) =>
      trainingApi.groups({ q: search, offset: page * 20 }, signal),
  });
  const members = useQuery({
    queryKey: ["group-members", group?.id, memberPage, memberSearch],
    queryFn: ({ signal }) =>
      trainingApi.users(
        { q: memberSearch, group_id: group!.id, offset: memberPage * 20 },
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
  const changeMember = useMutation({
    mutationFn: (remove: boolean) =>
      remove
        ? activityApi.remove(group!.id, moveStudent!)
        : activityApi.transfer(group!.id, moveStudent!, target!.id),
    onSuccess: () => {
      setMoveStudent(null);
      setTarget(null);
      for (const key of [
        "groups",
        "group-options",
        "group-members",
        "student-profile",
        "student-overview",
      ])
        void client.invalidateQueries({ queryKey: [key] });
    },
  });
  return (
    <Stack spacing={2}>
      <PageHeader title="Учебные группы" />
      <TextField
        label="Поиск группы"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
      />
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
      {profile && (
        <StudentProfileDialog
          studentId={profile}
          onClose={() => setProfile(null)}
        />
      )}
      <Dialog
        open={!!moveStudent}
        onClose={() => setMoveStudent(null)}
        fullWidth
      >
        <DialogTitle>Перевод или исключение из группы</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="info">
              Назначенные задания и результаты сохранятся.
            </Alert>
            <ServerSelect
              label="Другая группа"
              queryKey={["transfer-group-options"]}
              value={target}
              onChange={setTarget}
              load={async (q, signal) =>
                (await trainingApi.groups({ q }, signal)).items
                  .filter((g) => g.id !== group?.id)
                  .map((g) => ({ id: g.id, label: g.name }))
              }
            />
            <Button
              disabled={!target || changeMember.isPending}
              onClick={() => changeMember.mutate(false)}
            >
              Подтвердить перевод
            </Button>
            <Button
              color="error"
              disabled={changeMember.isPending}
              onClick={() => changeMember.mutate(true)}
            >
              Исключить из текущей группы
            </Button>
            {changeMember.error && (
              <Alert severity="error">
                {getApiError(changeMember.error).message}
              </Alert>
            )}
            <Button onClick={() => setMoveStudent(null)}>Отмена</Button>
          </Stack>
        </DialogContent>
      </Dialog>
      <Dialog open={!!group} onClose={() => setGroup(null)} fullWidth>
        <DialogTitle>{group?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Button component={Link} to={`/training?group=${group?.id}`}>
              Назначить задание
            </Button>
            {group && <MessageComposer key={group.id} groupId={group.id} />}
            <TextField
              label="Поиск ученика в группе"
              value={memberSearch}
              onChange={(e) => {
                setMemberSearch(e.target.value);
                setMemberPage(0);
              }}
            />
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
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {members.data.items.map((u) => (
                      <li key={u.id}>
                        <Button onClick={() => setProfile(u.id)}>
                          {userName(u)} · Профиль
                        </Button>
                        <Button
                          onClick={() => {
                            setMoveStudent(u.id);
                            changeMember.reset();
                          }}
                        >
                          Перевести / исключить
                        </Button>
                      </li>
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
