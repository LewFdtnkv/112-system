import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { MessageComposer } from "@/features/teaching-messages";
import { activityApi } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { download } from "@/shared/lib/download";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryState } from "@/shared/ui/QueryState";
import { LessonList } from "@/widgets/lesson-list";
import { StudentOverviewPanel } from "@/widgets/student-overview";
export function StudentProfilePage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [activePage, setActivePage] = useState(0);
  const profile = useQuery({
    queryKey: ["student-overview", studentId, activePage],
    queryFn: ({ signal }) =>
      activityApi.overview(studentId!, activePage * 6, signal),
    enabled: !!studentId,
    refetchInterval: 15000,
  });
  const report = useMutation({
    mutationFn: () => activityApi.report("xlsx", { student_id: studentId }),
    onSuccess: (blob) => download(blob, "student-report.xlsx"),
  });
  return (
    <Stack spacing={3}>
      <PageHeader
        title="Профиль ученика"
        description="Уроки ученика, назначенные вами, и их результаты"
      />
      <Stack direction="row" spacing={2}>
        <Button component={Link} to="/groups">
          К учебным группам
        </Button>
        <Button
          disabled={!profile.data || report.isPending}
          onClick={() => report.mutate()}
        >
          Скачать отчёт ученика XLSX
        </Button>
      </Stack>
      {report.error && (
        <Alert severity="error">{getApiError(report.error).message}</Alert>
      )}
      <QueryState
        pending={profile.isPending}
        error={profile.error}
        retry={() => void profile.refetch()}
      >
        {profile.data && (
          <>
            <StudentOverviewPanel
              data={profile.data}
              onActivePage={setActivePage}
            />
            <MessageComposer studentId={studentId!} />
            <Typography variant="h6" component="h2">
              Все уроки
            </Typography>
            <LessonList studentId={studentId} />
          </>
        )}
      </QueryState>
    </Stack>
  );
}
