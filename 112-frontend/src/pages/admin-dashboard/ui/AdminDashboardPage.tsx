import { Stack } from "@mui/material";
import { Link } from "react-router-dom";

import { useDemoScenarioStore } from "@/entities/scenario";
import { useDemoTrainingStore } from "@/entities/training-session";
import { demoUsers } from "@/entities/user";
import { routePaths } from "@/shared/config/routes";
import { PageHeader } from "@/shared/ui/PageHeader";
import { PageSection } from "@/shared/ui/PageSection";

export const AdminDashboardPage = () => {
  const scenarios = useDemoScenarioStore((state) => state.scenarios);
  const sessions = useDemoTrainingStore((state) => state.sessions);

  return (
    <Stack spacing={2}>
      <PageHeader title="Кабинет администратора" />
      <PageSection title="Обзор">
        <dl>
          <dt>Пользователи</dt>
          <dd>{demoUsers.length}</dd>
          <dt>Сценарии</dt>
          <dd>{scenarios.length}</dd>
          <dt>Занятия в процессе</dt>
          <dd>
            {
              sessions.filter((session) => session.status === "active")
                .length
            }
          </dd>
        </dl>
      </PageSection>
      <PageSection title="Управление">
        <ul>
          <li>
            <Link to={routePaths.users}>Пользователи</Link>
          </li>
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
      </PageSection>
    </Stack>
  );
};
