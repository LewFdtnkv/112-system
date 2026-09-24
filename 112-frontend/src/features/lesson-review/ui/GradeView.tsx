import { Alert, Paper, Stack, Typography } from "@mui/material";
import { styles } from "../styles/LessonReview";
import type { GradeViewProps } from "../types/LessonReview";
import { SemanticStatus } from "./SemanticReview";

export function GradeView({ grade }: GradeViewProps) {
  return (
    <Paper sx={styles.paper}>
      <Typography variant="h6" component="h2">
        {grade.method === "hybrid"
          ? "Оценка по правилам и ИИ"
          : grade.method === "rules"
            ? "Автоматическая оценка"
            : "Оценка преподавателя"}
        : {grade.score} / {grade.max_score}
      </Typography>
      <p style={styles.p}>{grade.comment}</p>
      {grade.assessment_details && (
        <Stack spacing={1}>
          {!!grade.assessment_details.missed_cards && (
            <Alert severity="warning">
              Не начато карточек: {grade.assessment_details.missed_cards}. Они
              учтены как 0. Итог — сумма процентов оценённых карточек, делённая
              на число всех назначенных карточек.
            </Alert>
          )}
          {grade.assessment_details.assistance && (
            <Alert severity="info">
              Выдано подсказок:{" "}
              {grade.assessment_details.assistance.issued_count}. Напоминаний:{" "}
              {grade.assessment_details.assistance.levels.goal ?? 0};
              объяснений:{" "}
              {grade.assessment_details.assistance.levels.explanation ?? 0};
              показов решения:{" "}
              {grade.assessment_details.assistance.levels.solution ?? 0}.
              Подсказки зафиксированы без автоматического штрафа; их содержание
              доступно преподавателю в журнале.
            </Alert>
          )}
          {grade.assessment_details.criteria.map((criterion) => (
            <Typography key={criterion.code} variant="body2">
              {criterion.label}: {criterion.score} / {criterion.max_score}
            </Typography>
          ))}
          {!!grade.assessment_details.recommendations?.length && (
            <Alert severity="info">
              <strong>Что повторить</strong>
              {grade.assessment_details.recommendations.map((text) => (
                <p key={text}>{text}</p>
              ))}
            </Alert>
          )}
          {grade.assessment_details.semantic ? (
            <SemanticStatus summary={grade.assessment_details.semantic} />
          ) : (
            <Alert severity="info">
              Оценены формальные критерии{" "}
              {grade.assessment_details.evaluated_cards} карточек. Смысловых
              полей вне оценки: {grade.assessment_details.unverified_fields}.
              Итог можно пересмотреть у преподавателя.
            </Alert>
          )}
        </Stack>
      )}
      <small>
        Редакция {grade.revision} ·{" "}
        {new Date(grade.created_at).toLocaleString("ru-RU", {
          timeZone: "Europe/Moscow",
        })}
      </small>
    </Paper>
  );
}
