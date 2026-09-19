import { Stack } from "@mui/material";

import { PageHeader } from "@/shared/ui/PageHeader";
import { useAuthStore } from "@/entities/user";
import { LessonList } from "@/widgets/lesson-list";
export const StudentDashboardPage = () => {
  const user = useAuthStore((state) => state.session);
  return (
    <Stack spacing={2}>
      <PageHeader title="Кабинет ученика" description={user?.name} />
      <LessonList student={true} />
    </Stack>
  );
};
