import { Stack } from "@mui/material";

import { useDemoTrainingStore } from "@/entities/training-session";
import { useAuthStore } from "@/entities/user";
import { PageHeader } from "@/shared/ui/PageHeader";
import { PageSection } from "@/shared/ui/PageSection";
import { SessionTable } from "@/widgets/session-monitor";

export const StudentDashboardPage = () => {
  const studentId = useAuthStore((state) => state.session?.userId);
  const sessions = useDemoTrainingStore((state) => state.sessions);
  const student = useAuthStore((state) => state.session);
  const studentSessions = sessions.filter(
    (session) => session.studentId === studentId,
  );

  return (
    <Stack spacing={2}>
      <PageHeader title="Кабинет ученика" description={student?.name} />
      <PageSection title="Мои занятия">
        <SessionTable
          label="Мои занятия"
          sessions={studentSessions.filter(
            (session) => session.status !== "completed",
          )}
          emptyTitle="Нет назначенных занятий"
        />
      </PageSection>
      <PageSection title="Завершённые занятия">
        <SessionTable
          label="Завершённые занятия ученика"
          sessions={studentSessions.filter(
            (session) => session.status === "completed",
          )}
          emptyTitle="Нет завершённых занятий"
        />
      </PageSection>
    </Stack>
  );
};
