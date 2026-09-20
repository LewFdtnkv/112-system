import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Stack, Typography } from "@mui/material";
import { StudentMessages } from "@/features/teaching-messages";
import { activityApi } from "@/entities/training";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryState } from "@/shared/ui/QueryState";
import { LessonList } from "@/widgets/lesson-list";
import { StudentOverviewPanel } from "@/widgets/student-overview";
export const StudentDashboardPage = () => {
  const [activePage, setActivePage] = useState(0);
  const profile = useQuery({
    queryKey: ["student-overview", "me", activePage],
    queryFn: ({ signal }) =>
      activityApi.overview(undefined, activePage * 6, signal),
    refetchInterval: 15000,
  });
  return (
    <Stack spacing={3}>
      <PageHeader title="Кабинет ученика" />
      <QueryState
        pending={profile.isPending}
        error={profile.error}
        retry={() => void profile.refetch()}
      >
        {profile.data && (
          <StudentOverviewPanel
            data={profile.data}
            own
            onActivePage={setActivePage}
          />
        )}
      </QueryState>
      <StudentMessages />
      <Typography variant="h6" component="h2">
        Все уроки
      </Typography>
      <LessonList student />
    </Stack>
  );
};
