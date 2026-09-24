import { userApi, userName } from "@/entities/training";
import { GroupDisband } from "@/features/group-disband";
import { StudentProfileDialog } from "@/features/student-profile";
import { MessageComposer } from "@/features/teaching-messages";
import { getApiError } from "@/shared/api";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
import { ServerSelect, type SelectOption } from "@/shared/ui/ServerSelect";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { styles } from "../styles/GroupsPage";
import type { GroupMembersDialogProps } from "../types/GroupDialogs";
import { GroupTransferDialog } from "./GroupTransferDialog";

export function GroupMembersDialog({
  group,
  onClose,
  onDisbanded,
}: GroupMembersDialogProps) {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [student, setStudent] = useState<SelectOption | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const [moveStudent, setMoveStudent] = useState<string | null>(null);
  const members = useQuery({
    queryKey: ["group-members", group?.id, page, search],
    queryFn: ({ signal }) =>
      userApi.users(
        { q: search, group_id: group!.id, offset: page * 20 },
        signal,
      ),
    enabled: !!group,
  });
  const add = useMutation({
    mutationFn: () => userApi.addStudent(group!.id, student!.id),
    onSuccess: () => {
      setStudent(null);
      void client.invalidateQueries({ queryKey: ["groups"] });
      void client.invalidateQueries({ queryKey: ["group-options"] });
      void client.invalidateQueries({ queryKey: ["group-members"] });
    },
  });
  const close = () => {
    setStudent(null);
    onClose();
  };
  return (
    <>
      <Dialog open={!!group} onClose={close} fullWidth>
        <DialogTitle>{group?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={styles.stack2}>
            <Button component={Link} to={`/training?group=${group?.id}`}>
              Назначить задание
            </Button>
            {group && <MessageComposer key={group.id} groupId={group.id} />}
            <TextField
              label="Поиск ученика в группе"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
            />
            <ServerSelect
              label="Ученик"
              queryKey={["student-options"]}
              value={student}
              onChange={setStudent}
              load={async (query, signal) =>
                (
                  await userApi.users({ q: query, role: "student" }, signal)
                ).items
                  .filter((user) => user.is_active)
                  .map((user) => ({ id: user.id, label: userName(user) }))
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
                  <ul style={styles.ul}>
                    {members.data.items.map((user) => (
                      <li key={user.id}>
                        <Button onClick={() => setProfile(user.id)}>
                          {userName(user)} · Профиль
                        </Button>
                        <Button
                          onClick={() => {
                            setMoveStudent(user.id);
                          }}
                        >
                          Перевести / исключить
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <PageControls
                    total={members.data.total}
                    page={page}
                    onPage={setPage}
                  />
                </>
              )}
            </QueryState>
            {group && (
              <GroupDisband
                group={group}
                onDisbanded={() => {
                  close();
                  onDisbanded();
                }}
              />
            )}
            <Button onClick={close}>Закрыть</Button>
          </Stack>
        </DialogContent>
      </Dialog>
      {profile && (
        <StudentProfileDialog
          studentId={profile}
          onClose={() => setProfile(null)}
        />
      )}
      {group && (
        <GroupTransferDialog
          groupId={group.id}
          studentId={moveStudent}
          onClose={() => setMoveStudent(null)}
          onChanged={() => {
            setPage(0);
          }}
        />
      )}
    </>
  );
}
