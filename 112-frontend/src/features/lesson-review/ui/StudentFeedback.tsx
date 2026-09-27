import { Alert, Paper, Stack, Typography } from "@mui/material";
import { QueryState } from "@/shared/ui/QueryState";
import { useStudentFeedback } from "../model/useStudentFeedback";
import { studentFeedbackLabels } from "../model/studentFeedbackLabels";
import { styles } from "../styles/LessonReview";
import type { StudentResultProps } from "../types/LessonReview";
import { SemanticFindingView } from "./SemanticFindingView";

export function StudentFeedback({ lessonId }: StudentResultProps) {
  const feedback = useStudentFeedback(lessonId);
  return (
    <Stack spacing={2}>
      <Typography variant="h6" component="h2">
        Разбор ИИ по карточкам
      </Typography>
      <QueryState
        pending={feedback.isPending}
        error={feedback.error}
        retry={() => void feedback.refetch()}
      >
        {feedback.data?.submitted ? (
          feedback.data.cards.map((card) => (
            <Paper
              key={card.assignment_id}
              sx={styles.paper}
              className="semantic-feedback"
              component="section"
            >
              <Stack spacing={1}>
                <Typography variant="h6" component="h3">
                  {card.position}. {card.title}
                </Typography>
                {card.findings.length ? (
                  card.findings.map((finding) => (
                    <SemanticFindingView key={finding.code} finding={finding} />
                  ))
                ) : (
                  <Alert
                    severity={card.status === "failed" ? "warning" : "info"}
                  >
                    {studentFeedbackLabels[card.status]}
                  </Alert>
                )}
              </Stack>
            </Paper>
          ))
        ) : (
          <Alert severity="info">
            Разбор карточек будет доступен после завершения занятия.
          </Alert>
        )}
      </QueryState>
    </Stack>
  );
}
