import { useState } from "react";
import {
  Alert,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { trainingApi } from "@/entities/training";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryState, PageControls } from "@/shared/ui/QueryState";
export const AnalyticsPage = () => {
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["analytics", page],
    queryFn: ({ signal }) =>
      trainingApi.analytics({ offset: page * 20 }, signal),
  });
  return (
    <Stack spacing={2}>
      <PageHeader title="Аналитика обучения" />
      <Alert severity="info">
        Учтены последние оценки преподавателя. Средний результат приведён к
        процентам от максимального балла. Оценка ИИ пока не подключена.
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
