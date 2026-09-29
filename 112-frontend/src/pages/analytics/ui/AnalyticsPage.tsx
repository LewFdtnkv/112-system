import { useAnalytics } from "../model/useAnalytics";
import { ErrorAnalytics } from "@/features/error-analytics";
import { getApiError } from "@/shared/api";
import { PageHeader } from "@/shared/ui/PageHeader";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
import {
  Alert,
  Button,
  Stack,
  Table,
  TableContainer,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
export const AnalyticsPage = () => {
  const { exportReport, page, setPage, track, setTrack, query } =
    useAnalytics();
  return (
    <Stack spacing={2}>
      <PageHeader title="Аналитика обучения" />
      <ToggleButtonGroup
        exclusive
        value={track}
        onChange={(_, value: string | null) => {
          if (value) {
            setTrack(value);
            setPage(0);
          }
        }}
        aria-label="Раздел аналитики"
        size="small"
      >
        <ToggleButton value="training">Тренировки</ToggleButton>
        <ToggleButton value="assessment">Контрольные занятия</ToggleButton>
      </ToggleButtonGroup>
      <ErrorAnalytics key={track} track={track} />
      <Typography variant="h5" component="h2">
        Итоги по сценариям
      </Typography>
      <Typography color="text.secondary">
        Все группы и весь период выбранного раздела занятий.
      </Typography>
      <Button
        disabled={exportReport.isPending}
        onClick={() => exportReport.mutate()}
      >
        Скачать отчёт по всем занятиям XLSX
      </Button>
      {exportReport.error && (
        <Alert severity="error">
          {getApiError(exportReport.error).message}
        </Alert>
      )}
      <Alert severity="info">
        Учтены автоматические оценки и последние пересмотры преподавателя.
        Средний результат приведён к процентам от максимального балла. Оценка ИИ
        учитывается после завершения проверки.
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
            <TableContainer>
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
            </TableContainer>
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
