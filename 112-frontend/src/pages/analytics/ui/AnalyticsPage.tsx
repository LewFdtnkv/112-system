import { activityApi, trainingApi } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { download } from "@/shared/lib/download";
import { PageHeader } from "@/shared/ui/PageHeader";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
import {
  Alert,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
export const AnalyticsPage = () => {
  const exportReport = useMutation({
    mutationFn: async () =>
      download(await activityApi.report("xlsx"), "training-report.xlsx"),
  });
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["analytics", page],
    queryFn: ({ signal }) =>
      trainingApi.analytics({ offset: page * 20 }, signal),
  });
  return (
    <Stack spacing={2}>
      <PageHeader title="Аналитика обучения" />
      <Button
        disabled={exportReport.isPending}
        onClick={() => exportReport.mutate()}
      >
        Скачать отчёт XLSX
      </Button>
      {exportReport.error && (
        <Alert severity="error">
          {getApiError(exportReport.error).message}
        </Alert>
      )}
      <Alert severity="info">
        Учтены автоматические оценки и последние пересмотры преподавателя.
        Средний результат приведён к процентам от максимального балла. Оценка ИИ
        пока не подключена.
      </Alert>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      >
        {query.data && (
          <>
            <Typography>
              Работ: {query.data.total} · Сданы: {query.data.submitted} ·
              Оценены: {query.data.graded} · Средний результат:{" "}
              {query.data.average_score_percent === null
                ? "—"
                : `${query.data.average_score_percent.toFixed(1)}%`}
            </Typography>
            <Table aria-label="Аналитика по сценариям">
              <TableHead>
                <TableRow>
                  <TableCell>Сценарий</TableCell>
                  <TableCell>Работ</TableCell>
                  <TableCell>Сданы</TableCell>
                  <TableCell>Оценены</TableCell>
                  <TableCell>Средний результат</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.scenarios.items.map((s) => (
                  <TableRow key={s.scenario_version_id}>
                    <TableCell>{s.title}</TableCell>
                    <TableCell>{s.total}</TableCell>
                    <TableCell>{s.submitted}</TableCell>
                    <TableCell>{s.graded}</TableCell>
                    <TableCell>
                      {s.average_score_percent === null
                        ? "—"
                        : `${s.average_score_percent.toFixed(1)}%`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PageControls
              total={query.data.scenarios.total}
              page={page}
              onPage={setPage}
            />
          </>
        )}
      </QueryState>
    </Stack>
  );
};
