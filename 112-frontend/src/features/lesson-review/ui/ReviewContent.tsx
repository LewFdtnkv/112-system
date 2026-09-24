import { LearningSummary, reviewApi } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { Alert, Button, Paper, Stack, Typography } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { styles } from "../styles/LessonReview";
import type { ReviewProps } from "../types/LessonReview";
import { AuditTrail } from "./AuditTrail";
import { CardComparison } from "./CardComparison";
import { GradeForm } from "./GradeForm";
import { GradeView } from "./GradeView";
import { SemanticReview } from "./SemanticReview";

export function ReviewContent({
  data,
  reload,
  renderProctoring,
  renderCardActions,
}: ReviewProps) {
  const calculate = useMutation({
    mutationFn: () => reviewApi.automaticGrade(data.lesson_id, data.student_id),
    onSuccess: reload,
  });
  const latest = data.evaluations.at(-1);
  return (
    <Stack spacing={2}>
      <LearningSummary policy={data.learning} result={data.learning_result} />
      {latest && <GradeView grade={latest} />}
      {!latest && data.submitted && (
        <Stack spacing={1}>
          <Alert severity="info">
            Работа завершена до включения автоматического оценивания.
          </Alert>
          <Button
            disabled={calculate.isPending}
            onClick={() => calculate.mutate()}
          >
            Рассчитать автоматическую оценку
          </Button>
          {calculate.error && (
            <Alert severity="error">
              {getApiError(calculate.error).message}
            </Alert>
          )}
        </Stack>
      )}
      {!data.submitted && (
        <Alert severity="info">
          Работа ещё не сдана полностью. Итог будет рассчитан автоматически
          после последней карточки.
        </Alert>
      )}
      {data.assignments.map((row) => (
        <Paper key={row.assignment_id} sx={styles.paper2}>
          <Typography variant="h6" component="h2">
            {row.position}. {row.source_snapshot?.title ?? "Карточка"}
          </Typography>
          <p>
            <b>Условие:</b> {row.source_snapshot?.caller_message}
          </p>
          <CardComparison
            row={row}
            actions={renderCardActions?.(row, data.assignments)}
          />
          {row.semantic_review && row.attempt && (
            <SemanticReview
              review={row.semantic_review}
              lessonId={data.lesson_id}
              studentId={data.student_id}
              attemptId={row.attempt.id}
            />
          )}
          {row.attempt && (
            <AuditTrail
              lessonId={data.lesson_id}
              studentId={data.student_id}
              attemptId={row.attempt.id}
            />
          )}
          {row.attempt && renderProctoring?.(row.attempt.id)}
        </Paper>
      ))}
      {data.evaluations.length > 1 && (
        <details>
          <summary>История оценок ({data.evaluations.length})</summary>
          <Stack spacing={1}>
            {data.evaluations.slice(0, -1).map((grade) => (
              <GradeView key={grade.id} grade={grade} />
            ))}
          </Stack>
        </details>
      )}
      <details>
        <summary>Пересмотр преподавателем</summary>
        <GradeForm key={latest?.revision ?? 0} data={data} reload={reload} />
      </details>
    </Stack>
  );
}
