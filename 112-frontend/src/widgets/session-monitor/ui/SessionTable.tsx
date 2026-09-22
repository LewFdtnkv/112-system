import { useDemoTrainingStore } from "@/features/demo-training";
import { rowAction } from "@/shared/lib/rowAction";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { Link, useNavigate } from "react-router-dom";
import type { SessionTableProps } from "../types/SessionTable";

import { useDemoScenarioStore } from "@/entities/scenario";
import { trainingStatusLabels } from "@/entities/training-session";
import { demoUsers, useAuthStore } from "@/entities/user";
import { getScorePercent } from "@/features/demo-training";
import {
  getStudentTrainingWorkspacePath,
  getTrainingResultPath,
  getTrainingSessionPath,
} from "@/shared/config/routes";
import { EmptyState } from "@/shared/ui/EmptyState";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Moscow",
});

export const SessionTable = ({
  sessions,
  label,
  emptyTitle = "Занятия не найдены",
}: SessionTableProps) => {
  const navigate = useNavigate();
  const scenarios = useDemoScenarioStore((state) => state.scenarios);
  const session = useAuthStore((state) => state.session);
  const evaluations = useDemoTrainingStore((state) => state.evaluations);
  const isStaff = session?.roles.some(
    (role) => role === "teacher" || role === "admin",
  );

  if (sessions.length === 0) return <EmptyState title={emptyTitle} />;

  return (
    <TableContainer>
      <Table size="small" aria-label={label}>
        <TableHead>
          <TableRow>
            <TableCell>Сценарий</TableCell>
            <TableCell>Ученик</TableCell>
            <TableCell>Дата (МСК)</TableCell>
            <TableCell>Статус</TableCell>
            <TableCell>Результат</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sessions.map((session) => {
            const scenario = scenarios.find(
              (item) => item.id === session.scenarioId,
            );
            const student = demoUsers.find(
              (user) => user.id === session.studentId,
            );
            const evaluation = evaluations.find(
              (item) => item.sessionId === session.id,
            );

            return (
              <TableRow
                key={session.id}
                {...rowAction(() =>
                  navigate(
                    isStaff
                      ? getTrainingSessionPath(session.id)
                      : session.status === "completed"
                        ? getTrainingResultPath(session.id)
                        : getStudentTrainingWorkspacePath(session.id),
                  ),
                )}
              >
                <TableCell component="th" scope="row">
                  <Link
                    to={
                      isStaff
                        ? getTrainingSessionPath(session.id)
                        : session.status === "completed"
                          ? getTrainingResultPath(session.id)
                          : getStudentTrainingWorkspacePath(session.id)
                    }
                  >
                    {scenario?.name ?? "Сценарий недоступен"}
                  </Link>
                </TableCell>
                <TableCell>
                  {student?.name ?? "Пользователь недоступен"}
                </TableCell>
                <TableCell>
                  <time dateTime={session.scheduledAt}>
                    {dateFormatter.format(new Date(session.scheduledAt))}
                  </time>
                </TableCell>
                <TableCell>{trainingStatusLabels[session.status]}</TableCell>
                <TableCell>
                  {evaluation ? (
                    <Link
                      to={getTrainingResultPath(session.id)}
                      aria-label={`Результат: ${scenario?.name}, ${student?.name}`}
                    >
                      {evaluation.totalScore} / {evaluation.maxScore} (
                      {getScorePercent(evaluation)}%)
                    </Link>
                  ) : (
                    "Не сформирован"
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};
