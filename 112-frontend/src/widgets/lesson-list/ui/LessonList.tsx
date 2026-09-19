import { useState } from "react";
import {
  Button,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { trainingApi, workStatusLabels } from "@/entities/training";
import { useDebounced } from "@/shared/lib/useDebounced";
import { QueryState, PageControls } from "@/shared/ui/QueryState";
import { EmptyState } from "@/shared/ui/EmptyState";
import {
  getStudentTrainingWorkspacePath,
  getTrainingResultPath,
} from "@/shared/config/routes";
export function LessonList({
  student = false,
  resultsOnly = false,
  lessonId,
}: {
  student?: boolean;
  resultsOnly?: boolean;
  lessonId?: string;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(resultsOnly ? "submitted" : "all");
  const [page, setPage] = useState(0);
  const q = useDebounced(search);
  const params = {
    q,
    status,
    limit: 20,
    offset: page * 20,
    ...(lessonId ? { lesson_id: lessonId } : {}),
  };
  const query = useQuery({
    queryKey: ["lessons", student, params],
    queryFn: ({ signal }) => trainingApi.lessons(student, params, signal),
    refetchInterval: student ? 15000 : 10000,
  });
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          label="Сценарий или ученик"
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        {!resultsOnly && (
          <TextField
            select
            label="Статус занятия"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <MenuItem value="all">Все статусы</MenuItem>
            {Object.entries(workStatusLabels).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
        )}
        <Button
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          Обновить
        </Button>
      </Stack>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      >
        {query.data && (
          <>
            <p role="status">
              Назначено: {query.data.assigned_count} · В процессе:{" "}
              {query.data.in_progress_count} · Завершено:{" "}
              {query.data.submitted_count} · Оценено: {query.data.graded_count}
            </p>
            {query.data.items.length ? (
              <TableContainer>
                <Table size="small" aria-label="Учебные занятия">
                  <TableHead>
                    <TableRow>
                      <TableCell>Сценарий / занятие</TableCell>
                      {!student && <TableCell>Ученик / группа</TableCell>}
                      <TableCell>Дата (МСК)</TableCell>
                      <TableCell>Статус</TableCell>
                      <TableCell>Карточки</TableCell>
                      <TableCell>Результат</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {query.data.items.map((row) => {
                      const reviewPath = `${getTrainingResultPath(row.lesson_id)}${student ? "" : `?student=${encodeURIComponent(row.student_id)}`}`;
                      const target =
                        student && row.work_status !== "submitted"
                          ? getStudentTrainingWorkspacePath(row.lesson_id)
                          : reviewPath;
                      return (
                        <TableRow key={`${row.lesson_id}:${row.student_id}`}>
                          <TableCell>
                            <Link className="table-block-link" to={target}>
                              {row.scenario_title}
                              <small>{row.title}</small>
                            </Link>
                          </TableCell>
                          {!student && (
                            <TableCell>
                              {row.student_name}
                              <small className="block-detail">
                                {row.group_name}
                              </small>
                            </TableCell>
                          )}
                          <TableCell>
                            {row.started_at
                              ? new Date(row.started_at).toLocaleString(
                                  "ru-RU",
                                  { timeZone: "Europe/Moscow" },
                                )
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {workStatusLabels[row.work_status]}
                            {row.role === "dds" && (
                              <small className="block-detail">
                                ДДС: выполнение пока недоступно
                              </small>
                            )}
                          </TableCell>
                          <TableCell>
                            {row.completed_count} / {row.card_count}
                          </TableCell>
                          <TableCell>
                            <Link className="table-block-link" to={reviewPath}>
                              {row.score !== null
                                ? `${row.score} / ${row.max_score}`
                                : row.work_status === "submitted"
                                  ? "Ожидает проверки"
                                  : "Открыть работу"}
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <EmptyState title="Занятия не найдены" />
            )}
            <PageControls
              total={query.data.total}
              page={page}
              onPage={setPage}
            />
          </>
        )}
      </QueryState>
    </Stack>
  );
}
