import { proctoringApi } from "@/entities/training";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
import { Alert, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ProctoringHistoryProps } from "../types/ProctoringHistory";
const labels: Record<string, string> = {
  "tab.hidden": "Вкладка скрыта",
  "tab.visible": "Вкладка видна",
  "window.blur": "Окно потеряло фокус",
  "window.focus": "Фокус возвращён",
};
export function ProctoringHistory({ attemptId }: ProctoringHistoryProps) {
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["proctoring", attemptId, page],
    queryFn: () => proctoringApi.proctoringHistory(attemptId, page * 20),
    refetchInterval: 5000,
  });
  return (
    <Stack spacing={1}>
      <Typography variant="h6">Прокторинг</Typography>
      <Alert severity="info">
        События браузера требуют проверки преподавателем. Потеря фокуса не
        доказывает списывание и не влияет на оценку. Запись камеры и экрана не
        ведётся.
      </Alert>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      >
        {query.data?.items.map((e) => (
          <Typography key={e.id}>
            {new Date(e.created_at).toLocaleString("ru-RU")} ·{" "}
            {labels[e.kind] ?? e.kind}
          </Typography>
        ))}
        {query.data?.total === 0 && <Typography>Событий пока нет</Typography>}
        {query.data && (
          <PageControls total={query.data.total} page={page} onPage={setPage} />
        )}
      </QueryState>
    </Stack>
  );
}
