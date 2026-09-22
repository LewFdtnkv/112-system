import { activityApi } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { download } from "@/shared/lib/download";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { styles } from "../styles/UserActivityDialog";
import type { UserActivityDialogProps } from "../types/UserActivityDialog";

export function UserActivityDialog({
  userId,
  onClose,
}: UserActivityDialogProps) {
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["user-activity", userId, page],
    queryFn: () => activityApi.activity(userId, page * 20),
  });
  const exportLog = useMutation({
    mutationFn: async (format: "txt" | "xlsx") =>
      download(
        await activityApi.activityExport(userId, format),
        `user-activity.${format}`,
      ),
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>История действий пользователя</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <QueryState
            pending={query.isPending}
            error={query.error}
            retry={() => void query.refetch()}
          >
            {query.data?.items.map((e) => (
              <Stack key={e.id} sx={styles.stack}>
                <Typography>
                  <strong>{e.kind}</strong> ·{" "}
                  {new Date(e.occurred_at).toLocaleString("ru-RU")}
                </Typography>
                <Typography sx={styles.typography}>{e.reason}</Typography>
                <small>Исполнитель: {e.actor_id ?? "Система"}</small>
              </Stack>
            ))}
            {query.data?.total === 0 && (
              <Typography>Событий пока нет</Typography>
            )}
            {query.data && (
              <PageControls
                total={query.data.total}
                page={page}
                onPage={setPage}
              />
            )}
          </QueryState>
          <Stack direction="row">
            <Button
              onClick={() => exportLog.mutate("txt")}
              disabled={exportLog.isPending}
            >
              Скачать TXT
            </Button>
            <Button
              onClick={() => exportLog.mutate("xlsx")}
              disabled={exportLog.isPending}
            >
              Скачать XLSX
            </Button>
          </Stack>
          {exportLog.error && (
            <Alert severity="error">
              {getApiError(exportLog.error).message}
            </Alert>
          )}
          <Button onClick={onClose}>Закрыть историю</Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
