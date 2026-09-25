import {
  assistanceLabels,
  lessonKindLabels,
  lessonPercent,
  percentText,
  workStatusLabels,
} from "@/entities/training";
import {
  getStudentTrainingWorkspacePath,
  getTrainingResultPath,
} from "@/shared/config/routes";
import { rowAction } from "@/shared/lib/rowAction";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { Link } from "react-router-dom";
import { styles } from "../styles/LessonList";
import type { LessonListTableProps } from "../types/LessonList";
export function LessonListTable({
  items,
  student,
  resultsOnly,
  studentId,
  onStudentSelect,
  onNavigate,
}: LessonListTableProps) {
  return (
    <TableContainer>
      <Table size="small" aria-label="Учебные занятия">
        <TableHead>
          <TableRow>
            <TableCell>Сценарий / занятие</TableCell>
            {!student && !studentId && <TableCell>Ученик / группа</TableCell>}
            <TableCell>Учебная роль</TableCell>
            <TableCell>Вид занятия / помощь</TableCell>
            <TableCell>Доступно (МСК)</TableCell>
            {!resultsOnly && <TableCell>Статус</TableCell>}
            <TableCell>Завершено (МСК)</TableCell>
            <TableCell>Карточки</TableCell>
            <TableCell>Результат</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((row) => {
            const reviewPath = `${getTrainingResultPath(row.lesson_id)}${student ? "" : `?student=${encodeURIComponent(row.student_id)}`}`;
            const target =
              student && row.work_status !== "submitted"
                ? getStudentTrainingWorkspacePath(row.lesson_id)
                : reviewPath;
            return (
              <TableRow
                key={`${row.lesson_id}:${row.student_id}`}
                {...rowAction(() => onNavigate(target))}
              >
                <TableCell>
                  <Link className="table-block-link" to={target}>
                    {row.scenario_title}
                    <small className="block-detail">{row.title}</small>
                  </Link>
                </TableCell>
                {!student && !studentId && (
                  <TableCell>
                    <Button
                      className="table-block-link"
                      onClick={() => onStudentSelect(row.student_id)}
                    >
                      {row.student_name}
                    </Button>
                    <small className="block-detail">{row.group_name}</small>
                  </TableCell>
                )}
                <TableCell sx={styles.tableCell}>
                  {row.role === "dds" ? "ДДС" : "Оператор 112"}
                </TableCell>
                <TableCell>
                  {lessonKindLabels[row.learning.kind]}
                  <small className="block-detail">
                    {assistanceLabels[row.learning.assistance.max_level]}
                    {row.learning.assistance.max_level !== "none"
                      ? " · запланированы"
                      : ""}
                  </small>
                </TableCell>
                <TableCell>
                  {(row.available_from ?? row.started_at)
                    ? new Date(
                        (row.available_from ?? row.started_at)!,
                      ).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })
                    : "Сразу"}
                  <small className="block-detail">
                    До:{" "}
                    {row.available_until
                      ? new Date(row.available_until).toLocaleString("ru-RU", {
                          timeZone: "Europe/Moscow",
                        })
                      : "Без срока"}
                  </small>
                </TableCell>
                {!resultsOnly && (
                  <TableCell>{workStatusLabels[row.work_status]}</TableCell>
                )}
                <TableCell sx={styles.tableCell2}>
                  {row.completed_at ? (
                    <time dateTime={row.completed_at}>
                      {new Date(row.completed_at).toLocaleString("ru-RU", {
                        timeZone: "Europe/Moscow",
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
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
  );
}
