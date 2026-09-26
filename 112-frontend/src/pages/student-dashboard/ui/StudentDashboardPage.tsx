import { activityApi } from "@/entities/training";
import { StudentMessages } from "@/features/teaching-messages";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryState } from "@/shared/ui/QueryState";
import { LessonList } from "@/widgets/lesson-list";
import { StudentOverviewPanel } from "@/widgets/student-overview";
import { Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
export const StudentDashboardPage = () => {
  const [availablePage, setAvailablePage] = useState(0);
  const [activePage, setActivePage] = useState(0);
  const profile = useQuery({
    queryKey: ["student-overview", "me", activePage, availablePage],
    queryFn: ({ signal }) =>
      activityApi.overview(
        undefined,
        activePage * 6,
        signal,
        availablePage * 6,
      ),
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
            onAvailablePage={setAvailablePage}
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
