import { Stack } from "@mui/material";
import { Link, useParams } from "react-router-dom";

import { useDemoScenarioStore } from "@/entities/scenario";
import {
  trainingStatusLabels,
  useDemoTrainingStore,
} from "@/entities/training-session";
import { demoUsers } from "@/entities/user";
import { getTrainingResultPath, routePaths } from "@/shared/config/routes";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PageHeader } from "@/shared/ui/PageHeader";
import { PageSection } from "@/shared/ui/PageSection";
import { SessionTable } from "@/widgets/session-monitor";

export const TrainingSessionPage = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const scenarios = useDemoScenarioStore((state) => state.scenarios);
  const sessions = useDemoTrainingStore((state) => state.sessions);
  const session = sessions.find((item) => item.id === sessionId);

  if (!sessionId)
    return (
      <Stack spacing={2}>
        <PageHeader title="Учебные занятия" />
        <SessionTable sessions={sessions} label="Учебные занятия" />
      </Stack>
    );

  const scenario = scenarios.find((item) => item.id === session?.scenarioId);
  const student = demoUsers.find((user) => user.id === session?.studentId);
  const teacher = demoUsers.find((user) => user.id === session?.teacherId);

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Учебное занятие"
        actions={<Link to={routePaths.training}>К занятиям</Link>}
      />
      {session ? (
        <>
          <PageSection title={scenario?.name ?? "Сценарий недоступен"}>
            <dl>
              <dt>Ученик</dt>
              <dd>{student?.name ?? "Нет данных"}</dd>
              <dt>Преподаватель</dt>
              <dd>{teacher?.name ?? "Нет данных"}</dd>
              <dt>Статус</dt>
              <dd>{trainingStatusLabels[session.status]}</dd>
              <dt>Продолжительность</dt>
              <dd>
                {scenario ? `${scenario.durationMinutes} мин` : "Нет данных"}
              </dd>
            </dl>
          </PageSection>
          <PageSection title="Учебное обращение">
            <p>{scenario?.description ?? "Описание недоступно"}</p>
          </PageSection>
          <PageSection title="Результат">
            {session.status === "completed" ? (
              <Link to={getTrainingResultPath(session.id)}>
                Открыть результат
              </Link>
            ) : (
              <EmptyState title="Результат ещё не сформирован" />
            )}
          </PageSection>
        </>
      ) : (
        <EmptyState title="Занятие не найдено" />
      )}
    </Stack>
  );
};
