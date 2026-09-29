import { Alert, Button, Chip, Stack, Typography } from "@mui/material";
import { getApiError } from "@/shared/api";
import { useRecommendationFeedback } from "../model/useStudentMessages";
import type { StudentMessageProps } from "../types/TeachingMessages";
import { RecommendationAction } from "./RecommendationAction";
import { styles } from "../styles/TeachingMessages";

export function StudentMessage({
  message: m,
  pending,
  onRead,
}: StudentMessageProps) {
  const advice = m.source === "learning_advice";
  const feedback = useRecommendationFeedback(m.id);
  const details = m.details;
  return (
    <Alert
      severity={advice ? "info" : m.read_at ? "info" : "warning"}
      action={
        !m.read_at && (
          <Button disabled={pending} onClick={() => onRead(m.id)}>
            Прочитано
          </Button>
        )
      }
    >
      <Stack spacing={1}>
        <strong>
          {advice
            ? "Учебный помощник · дальнейшее обучение"
            : `${m.teacher_name} · ${m.group_name ?? "Лично вам"}`}
        </strong>
        {advice && (
          <Stack direction="row" spacing={1} useFlexGap sx={styles.badges}>
            <Chip
              size="small"
              label={details.role === "dds" ? "ДДС" : "Оператор 112"}
            />
            <Chip
              size="small"
              label={
                details.mode === "ai"
                  ? "Подобрано с ИИ"
                  : "Методическая рекомендация"
              }
            />
          </Stack>
        )}
        {details?.obsolete && (
          <Typography color="text.secondary">
            Оценки пересмотрены. Эта рекомендация устарела.
          </Typography>
        )}
        <Typography sx={styles.typography}>{m.text}</Typography>
        {advice && !details.obsolete && (
          <>
            {details.suggestions?.map((s) => (
              <RecommendationAction key={s.skill} suggestion={s} />
            ))}
            <Stack direction="row" spacing={1}>
              <Button
                disabled={feedback.isPending || details.feedback === "helpful"}
                onClick={() => feedback.mutate(true)}
              >
                Полезно
              </Button>
              <Button
                disabled={
                  feedback.isPending || details.feedback === "not_helpful"
                }
                onClick={() => feedback.mutate(false)}
              >
                Не подходит
              </Button>
            </Stack>
            {details.feedback && (
              <Typography variant="body2">
                Отзыв сохранён. Он не меняет оценку.
              </Typography>
            )}
            {feedback.error && (
              <Typography role="alert" color="error">
                {getApiError(feedback.error).message}
              </Typography>
            )}
          </>
        )}
        <small>{new Date(m.created_at).toLocaleString("ru-RU")}</small>
      </Stack>
    </Alert>
  );
}
