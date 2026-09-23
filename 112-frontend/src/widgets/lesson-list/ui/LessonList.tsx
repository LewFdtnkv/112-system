import { useLessonList } from "../model/useLessonList";
import {
  lessonPercent,
  lessonKindLabels,
  assistanceLabels,
  percentText,
  workStatusLabels,
} from "@/entities/training";
import { StudentProfileDialog } from "@/features/student-profile";
import {
  getStudentTrainingWorkspacePath,
  getTrainingResultPath,
} from "@/shared/config/routes";
import { rowAction } from "@/shared/lib/rowAction";
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
  const {
    search,
    setSearch,
    status,
    setStatus,
    role,
    setRole,
    kind,
    setKind,
    page,
    setPage,
    query,
  } = useLessonList({ student, resultsOnly, lessonId, studentId });
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
          label="Учебная роль"
          value={role}
          sx={styles.textField}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(0);
          }}
        >
          <MenuItem value="all">Все роли</MenuItem>
          <MenuItem value="operator_112">Оператор 112</MenuItem>
          <MenuItem value="dds">ДДС</MenuItem>
        </TextField>
        <TextField
          select
          label="Вид занятия"
          value={kind}
          sx={styles.textField}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(0);
          }}
        >
          <MenuItem value="all">Все виды</MenuItem>
          {Object.entries(lessonKindLabels).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
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
                      <TableCell>Учебная роль</TableCell>
                      <TableCell>Вид занятия / помощь</TableCell>
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
                            {lessonKindLabels[row.learning.kind]}
                            <small className="block-detail">
                              {
                                assistanceLabels[
                                  row.learning.assistance.max_level
                                ]
                              }
                              {row.learning.assistance.max_level !== "none"
                                ? " · запланированы"
                                : ""}
                            </small>
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
                                {row.evaluation_method === "hybrid"
                                  ? "Правила + ИИ"
                                  : row.evaluation_method === "rules"
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
