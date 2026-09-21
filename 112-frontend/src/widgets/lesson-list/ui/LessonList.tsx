import {
  lessonPercent,
  percentText,
  trainingApi,
  workStatusLabels,
} from "@/entities/training";
import { StudentProfileDialog } from "@/features/student-profile";
import {
  getStudentTrainingWorkspacePath,
  getTrainingResultPath,
} from "@/shared/config/routes";
import { rowAction } from "@/shared/lib/rowAction";
import { useDebounced } from "@/shared/lib/useDebounced";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
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
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { styles } from "../styles/LessonList";
import type { LessonListProps } from "../types/LessonList";
export function LessonList({
  student = false,
  resultsOnly = false,
  lessonId,
  studentId,
}: LessonListProps) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(resultsOnly ? "submitted" : "all");
  const [role, setRole] = useState("all");
  const [page, setPage] = useState(0);
  const q = useDebounced(search);
  const params = {
    q,
    status,
    role,
    limit: 20,
    offset: page * 20,
    ...(studentId ? { student_id: studentId } : {}),
    ...(lessonId ? { lesson_id: lessonId } : {}),
  };
  const query = useQuery({
    queryKey: ["lessons", student, params],
    queryFn: ({ signal }) => trainingApi.lessons(student, params, signal),
    refetchInterval: student ? 15000 : 10000,
  });
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <TextField
          label="Сценарий или ученик"
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <TextField
          select
          label="Тип занятия"
          value={role}
          sx={styles.textField}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(0);
          }}
        >
          <MenuItem value="all">Все типы</MenuItem>
          <MenuItem value="operator_112">Оператор 112</MenuItem>
          <MenuItem value="dds">ДДС</MenuItem>
        </TextField>
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
      {profile && (
        <StudentProfileDialog
          studentId={profile}
          onClose={() => setProfile(null)}
        />
      )}
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
                      {!student && !studentId && (
                        <TableCell>Ученик / группа</TableCell>
                      )}
                      <TableCell>Тип занятия</TableCell>
                      <TableCell>Доступно (МСК)</TableCell>
                      <TableCell>Статус</TableCell>
                      <TableCell>Завершено (МСК)</TableCell>
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
                        <TableRow
                          key={`${row.lesson_id}:${row.student_id}`}
                          {...rowAction(() => navigate(target))}
                        >
                          <TableCell>
                            <Link className="table-block-link" to={target}>
                              {row.scenario_title}
                              <small className="block-detail">
                                {row.title}
                              </small>
                            </Link>
                          </TableCell>
                          {!student && !studentId && (
                            <TableCell>
                              <Button
                                className="table-block-link"
                                onClick={() => setProfile(row.student_id)}
                              >
                                {row.student_name}
                              </Button>
                              <small className="block-detail">
                                {row.group_name}
                              </small>
                            </TableCell>
                          )}
                          <TableCell sx={styles.tableCell}>
                            {row.role === "dds" ? "ДДС" : "Оператор 112"}
                          </TableCell>
                          <TableCell>
                            {(row.available_from ?? row.started_at)
                              ? new Date(
                                  (row.available_from ?? row.started_at)!,
                                ).toLocaleString("ru-RU", {
                                  timeZone: "Europe/Moscow",
                                })
                              : "Сразу"}
                            <small className="block-detail">
                              До:{" "}
                              {row.available_until
                                ? new Date(row.available_until).toLocaleString(
                                    "ru-RU",
                                    { timeZone: "Europe/Moscow" },
                                  )
                                : "Без срока"}
                            </small>
                          </TableCell>
                          <TableCell>
                            {workStatusLabels[row.work_status]}
                          </TableCell>
                          <TableCell sx={styles.tableCell2}>
                            {row.completed_at ? (
                              <time dateTime={row.completed_at}>
                                {new Date(row.completed_at).toLocaleString(
                                  "ru-RU",
                                  {
                                    timeZone: "Europe/Moscow",
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  },
                                )}
                              </time>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>
                            {row.completed_count} / {row.card_count}
                          </TableCell>
                          <TableCell>
                            <Link className="table-block-link" to={reviewPath}>
                              {row.score !== null
                                ? percentText(lessonPercent(row))
                                : row.work_status === "submitted"
                                  ? "Нет итоговой оценки"
                                  : "Открыть работу"}
                            </Link>
                            {row.score !== null && (
                              <small>
                                {row.evaluation_method === "rules"
                                  ? "Автоматически"
                                  : "Преподаватель"}
                              </small>
                            )}
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
