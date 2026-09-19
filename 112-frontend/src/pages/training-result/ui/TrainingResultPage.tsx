import {
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { Link, useParams } from "react-router-dom";

import {
  criterionLabels,
  getScorePercent,
} from "@/entities/evaluation/demoEvaluations";
import { useDemoScenarioStore } from "@/entities/scenario";
import { useDemoTrainingStore } from "@/entities/training-session";
import { demoUsers, useAuthStore } from "@/entities/user";
import { getTrainingSessionPath, routePaths } from "@/shared/config/routes";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { PageSection } from "@/shared/ui/PageSection";
import { SessionTable } from "@/widgets/session-monitor";

export const TrainingResultPage = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const scenarios = useDemoScenarioStore((state) => state.scenarios);
  const authSession = useAuthStore((state) => state.session);
  const sessions = useDemoTrainingStore((state) => state.sessions);
  const evaluations = useDemoTrainingStore((state) => state.evaluations);
  const isStaff = authSession?.roles.some(
    (role) => role === "teacher" || role === "admin",
  );
  const visibleSessions = sessions.filter(
    (item) => isStaff || item.studentId === authSession?.userId,
  );
  const session = visibleSessions.find((item) => item.id === sessionId);
  const evaluation = evaluations.find((item) => item.sessionId === sessionId);
  const scenario = scenarios.find((item) => item.id === session?.scenarioId);
  const student = demoUsers.find((user) => user.id === session?.studentId);

  if (!sessionId)
    return (
      <Stack spacing={2}>
        <PageHeader title="Результаты" />
        <SessionTable
          sessions={visibleSessions.filter(
            (item) => item.status === "completed",
          )}
          label="Результаты занятий"
        />
      </Stack>
    );

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Результат занятия"
        actions={<Link to={routePaths.results}>К результатам</Link>}
      />
      {evaluation && session ? (
        <>
          <PageSection title={scenario?.name ?? "Сценарий недоступен"}>
            <p>{student?.name}</p>
            <p>
              Итог: {evaluation.totalScore} / {evaluation.maxScore} (
              {getScorePercent(evaluation)}%)
            </p>
            {isStaff && (
              <Link to={getTrainingSessionPath(session.id)}>
                Открыть занятие
              </Link>
            )}
          </PageSection>
          <TableContainer>
            <Table size="small" aria-label="Оценка по критериям">
              <TableHead>
                <TableRow>
                  <TableCell>Критерий</TableCell>
                  <TableCell>Баллы</TableCell>
                  <TableCell>Максимум</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {evaluation.criteria.map((criterion) => (
                  <TableRow key={criterion.key}>
                    <TableCell component="th" scope="row">
                      {criterionLabels[criterion.key]}
                    </TableCell>
                    <TableCell>{criterion.score}</TableCell>
                    <TableCell>{criterion.maxScore}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <PageSection title="Комментарий преподавателя">
            <p>
              {evaluation.expertComment ??
                "Комментарий преподавателя ещё не добавлен."}
            </p>
          </PageSection>
        </>
      ) : (
        <EmptyState
          title={
            session ? "Результат ещё не сформирован" : "Занятие не найдено"
          }
          action={
            session && isStaff ? (
              <Link to={getTrainingSessionPath(session.id)}>К занятию</Link>
            ) : undefined
          }
        />
      )}
    </Stack>
  );
};
