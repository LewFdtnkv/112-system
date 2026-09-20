import { useState, type ReactNode } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  Stack,
  Typography,
} from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { activityApi, userName } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { download } from "@/shared/lib/download";
import { getTrainingResultPath } from "@/shared/config/routes";
import { PageControls, QueryState } from "@/shared/ui/QueryState";

export function StudentProfileDialog({
  studentId,
  onClose,
  children,
}: {
  studentId: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["student-profile", studentId, page],
    queryFn: () => activityApi.profile(studentId, page * 20),
  });
  const report = useMutation({
    mutationFn: () => activityApi.report("xlsx", { student_id: studentId }),
    onSuccess: (blob) => download(blob, "student-report.xlsx"),
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Профиль ученика</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <QueryState
            pending={query.isPending}
            error={query.error}
            retry={() => void query.refetch()}
          >
            {query.data && (
              <>
                <Typography variant="h6">
                  {userName(query.data.user)}
                </Typography>
                <Typography>
                  {query.data.user.username} ·{" "}
                  {query.data.user.email ?? "Email не указан"}
                </Typography>
                <Typography>
                  Заданий: {query.data.lessons.total} · Завершено:{" "}
                  {query.data.lessons.submitted_count} · Оценено:{" "}
                  {query.data.lessons.graded_count}
                </Typography>
                {query.data.lessons.items.map((row) => (
                  <Button
                    component={Link}
                    key={row.lesson_id}
                    to={`${getTrainingResultPath(row.lesson_id)}?student=${studentId}`}
                  >
                    {row.title} · {row.completed_count}/{row.card_count}{" "}
                    карточек ·{" "}
                    {row.score === null
                      ? "Без оценки"
                      : `${row.score}/${row.max_score}`}
                  </Button>
                ))}
                <PageControls
                  total={query.data.lessons.total}
                  page={page}
                  onPage={setPage}
                />
              </>
            )}
          </QueryState>
          {children}
          <Button disabled={report.isPending} onClick={() => report.mutate()}>
            Скачать отчёт ученика XLSX
          </Button>
          {report.error && (
            <Alert severity="error">{getApiError(report.error).message}</Alert>
          )}
          <Button onClick={onClose}>Закрыть профиль</Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
