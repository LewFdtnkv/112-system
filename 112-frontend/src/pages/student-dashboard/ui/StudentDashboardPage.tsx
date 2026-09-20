import { StudentMessages } from "@/features/teaching-messages";
import { UserPhoto, trainingApi, userName } from "@/entities/training";
import { useQuery } from "@tanstack/react-query";
import { Stack, Typography } from "@mui/material";

import { PageHeader } from "@/shared/ui/PageHeader";
import { useAuthStore } from "@/entities/user";
import { LessonList } from "@/widgets/lesson-list";
export const StudentDashboardPage = () => {
  const user = useAuthStore((state) => state.session);
  const profile = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => trainingApi.me(),
    enabled: !!user,
  });
  return (
    <Stack spacing={2}>
      <PageHeader title="Кабинет ученика" description={user?.name} />
      {user && <UserPhoto userId={user.userId} />}
      {profile.data && (
        <Typography>
          {userName(profile.data)} · {profile.data.username} ·{" "}
          {profile.data.email ?? "Email не указан"}
        </Typography>
      )}
      <StudentMessages />
      <LessonList student={true} />
    </Stack>
  );
};
