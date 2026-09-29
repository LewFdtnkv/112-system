import { Button, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";
import { getStudentTrainingWorkspacePath } from "@/shared/config/routes";
import { getApiError } from "@/shared/api";
import { useReferralLesson } from "../model/useReferralLesson";
import type { RecommendationSuggestion } from "../types/TeachingMessages";

export function RecommendationAction({
  suggestion: s,
}: {
  suggestion: RecommendationSuggestion;
}) {
  const create = useReferralLesson();
  const referral = s.referral;
  const lessonId = referral?.lesson_id ?? s.lesson_id;
  return (
    <Stack spacing={1}>
      {referral?.status === "available" ? (
        <>
          <Typography variant="body2">
            Направление: {s.label}. Действует до{" "}
            {new Date(referral.expires_at).toLocaleString("ru-RU")}. По нему
            можно создать одно личное занятие.
          </Typography>
          <Button
            variant="outlined"
            disabled={create.isPending}
            onClick={() => create.mutate(referral.id)}
          >
            {create.isPending
              ? "Создаём занятие…"
              : `${s.label}: создать занятие`}
          </Button>
        </>
      ) : lessonId ? (
        <Button
          component={Link}
          to={getStudentTrainingWorkspacePath(lessonId)}
          variant="outlined"
        >
          {s.label}: открыть занятие
        </Button>
      ) : (
        <Typography variant="body2">
          {referral?.status === "expired"
            ? `Срок направления «${s.label}» истёк. Обсудите дальнейшее обучение с преподавателем.`
            : `Для навыка «${s.label}» пока нет подходящего сценария. Попросите преподавателя назначить тренировку.`}
        </Typography>
      )}
      {create.error && (
        <Typography role="alert" color="error">
          {getApiError(create.error).message}
        </Typography>
      )}
    </Stack>
  );
}
