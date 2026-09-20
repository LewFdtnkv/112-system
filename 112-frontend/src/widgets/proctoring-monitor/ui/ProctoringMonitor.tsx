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
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { activityApi } from "@/entities/training";
import { ProctoringHistory } from "@/features/proctoring";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
export function ProctoringMonitor() {
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["proctoring-monitor", page],
    queryFn: () => activityApi.monitoring(page * 20),
    refetchInterval: 5000,
  });
  return (
    <Stack spacing={1}>
      <Typography variant="h6">Контроль активных карточек</Typography>
      <Alert severity="info">
        Обновление каждые 5 секунд. Здесь только прокторинг; учебные действия и
        оценка доступны в работе ученика. События браузера не подтверждают
        списывание.
      </Alert>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      >
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Ученик</TableCell>
              <TableCell>Задание</TableCell>
              <TableCell>Вкладка / окно</TableCell>
              <TableCell>Скрытия вкладки</TableCell>
              <TableCell>Подробности</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {query.data?.items.map((r) => (
              <TableRow key={r.attempt_id}>
                <TableCell>{r.student_name}</TableCell>
                <TableCell>{r.title}</TableCell>
                <TableCell>
                  {r.visibility === "tab.hidden"
                    ? "Скрыта"
                    : r.visibility === "tab.visible"
                      ? "Видна"
                      : "Нет данных"}{" "}
                  /{" "}
                  {r.focus === "window.blur"
                    ? "Без фокуса"
                    : r.focus === "window.focus"
                      ? "В фокусе"
                      : "Нет данных"}
                  <small className="block-detail">
                    Последнее сообщение:{" "}
                    {r.last_seen
                      ? new Date(r.last_seen).toLocaleTimeString("ru-RU")
                      : "Нет данных"}
                  </small>
                </TableCell>
                <TableCell>{r.hidden_count}</TableCell>
                <TableCell>
                  <Button onClick={() => setAttempt(r.attempt_id)}>
                    Прокторинг
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {query.data?.total === 0 && (
          <Typography>Активных карточек нет</Typography>
        )}
        {query.data && (
          <PageControls total={query.data.total} page={page} onPage={setPage} />
        )}
      </QueryState>
      <Dialog
        open={!!attempt}
        onClose={() => setAttempt(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>События прокторинга</DialogTitle>
        <DialogContent>
          {attempt && <ProctoringHistory attemptId={attempt} />}
          <Button onClick={() => setAttempt(null)}>Закрыть</Button>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
