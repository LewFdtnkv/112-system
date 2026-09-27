import { userKeys } from "@/entities/user";
import { userApi, invalidateGroupMembers } from "@/entities/user";
import { getApiError } from "@/shared/api";
import { ServerSelect, type SelectOption } from "@/shared/ui/ServerSelect";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { styles } from "../styles/GroupsPage";
import type { GroupTransferDialogProps } from "../types/GroupDialogs";

export function GroupTransferDialog({
  groupId,
  studentId,
  onClose,
  onChanged,
}: GroupTransferDialogProps) {
  const client = useQueryClient();
  const [target, setTarget] = useState<SelectOption | null>(null);
  const change = useMutation({
    mutationFn: (remove: boolean) =>
      remove
        ? userApi.remove(groupId, studentId!)
        : userApi.transfer(groupId, studentId!, target!.id),
    onSuccess: () => {
      setTarget(null);
      void invalidateGroupMembers(client);
      onChanged();
      onClose();
    },
  });
  return (
    <Dialog open={!!studentId} onClose={onClose} fullWidth>
      <DialogTitle>Перевод или исключение из группы</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={styles.stack}>
          <Alert severity="info">
            Назначенные задания и результаты сохранятся.
          </Alert>
          <ServerSelect
            label="Другая группа"
            queryKey={userKeys.transferGroups}
            value={target}
            onChange={setTarget}
            load={async (query, signal) =>
              (await userApi.groups({ q: query }, signal)).items
                .filter((group) => group.id !== groupId)
                .map((group) => ({ id: group.id, label: group.name }))
            }
          />
          <Button
            disabled={!target || change.isPending}
            onClick={() => change.mutate(false)}
          >
            Подтвердить перевод
          </Button>
          <Button
            color="error"
            disabled={change.isPending}
            onClick={() => change.mutate(true)}
          >
            Исключить из текущей группы
          </Button>
          {change.error && (
            <Alert severity="error">{getApiError(change.error).message}</Alert>
          )}
          <Button onClick={onClose}>Отмена</Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
