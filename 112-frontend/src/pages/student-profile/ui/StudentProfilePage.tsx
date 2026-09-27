import { studentApi } from "@/entities/training";
import { TeacherMessageAction } from "@/features/teaching-messages";
import { getApiError } from "@/shared/api";
import { download } from "@/shared/lib/download";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryState } from "@/shared/ui/QueryState";
import { LessonList } from "@/widgets/lesson-list";
import { StudentOverviewPanel } from "@/widgets/student-overview";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
export function StudentProfilePage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [availablePage, setAvailablePage] = useState(0);
  const [activePage, setActivePage] = useState(0);
  const profile = useQuery({
    queryKey: ["student-overview", studentId, activePage, availablePage],
    queryFn: ({ signal }) =>
      studentApi.overview(
        studentId!,
        activePage * 6,
        signal,
        availablePage * 6,
      ),
    enabled: !!studentId,
    refetchInterval: 15000,
  });
  const report = useMutation({
    mutationFn: () => studentApi.report("xlsx", { student_id: studentId }),
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
              onAvailablePage={setAvailablePage}
            />
            <TeacherMessageAction studentId={studentId!} />
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
