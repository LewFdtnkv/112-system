import { activityApi, userApi } from "@/entities/training";
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
        ? activityApi.remove(groupId, studentId!)
        : activityApi.transfer(groupId, studentId!, target!.id),
    onSuccess: () => {
      setTarget(null);
      for (const key of [
        "groups",
        "group-options",
        "group-members",
        "student-profile",
        "student-overview",
      ])
        void client.invalidateQueries({ queryKey: [key] });
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
            queryKey={["transfer-group-options"]}
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
