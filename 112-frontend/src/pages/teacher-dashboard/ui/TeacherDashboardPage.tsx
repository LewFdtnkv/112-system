import { Stack } from "@mui/material";
import { Link } from "react-router-dom";

import { useDemoTrainingStore } from "@/entities/training-session";
import { demoTeacherId, demoUsers } from "@/entities/user";
import { routePaths } from "@/shared/config/routes";
import { PageHeader } from "@/shared/ui/PageHeader";
import { PageSection } from "@/shared/ui/PageSection";
import { SessionTable } from "@/widgets/session-monitor";

export const TeacherDashboardPage = () => {
  const teacher = demoUsers.find((user) => user.id === demoTeacherId);
  const allSessions = useDemoTrainingStore((state) => state.sessions);
  const sessions = allSessions.filter(
    (session) => session.teacherId === demoTeacherId,
  );

  return (
    <Stack spacing={2}>
      <PageHeader title="Кабинет преподавателя" description={teacher?.name} />
      <nav aria-label="Работа преподавателя">
        <ul>
          <li>
            <Link to={routePaths.scenarios}>Сценарии</Link>
          </li>
          <li>
            <Link to={routePaths.sessionMonitoring}>Мониторинг занятий</Link>
          </li>
          <li>
            <Link to={routePaths.analytics}>Аналитика</Link>
          </li>
        </ul>
      </nav>
      <PageSection title="Текущие и назначенные занятия">
        <SessionTable
          label="Занятия преподавателя"
          sessions={sessions.filter(
            (session) => session.status !== "completed",
          )}
        />
      </PageSection>
      <PageSection title="Последние результаты">
        <SessionTable
          label="Результаты учеников"
          sessions={sessions.filter(
            (session) => session.status === "completed",
          )}
        />
      </PageSection>
    </Stack>
  );
};
