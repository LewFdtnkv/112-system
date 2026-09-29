import { Alert, Button, Stack, Typography } from "@mui/material";
import { getApiError } from "@/shared/api";
import { RetrievedExamples } from "./RetrievedExamples";
import { AssessmentMemory } from "./AssessmentMemory";
import { useAssessmentMemory } from "../model/useAssessmentMemory";
import { useSemanticRetry } from "../model/useSemanticRetry";
import { SemanticFindingView } from "./SemanticFindingView";
import { semanticStatusLabels } from "../model/semanticLabels";
import type {
  SemanticReviewProps,
  SemanticStatusProps,
} from "../types/SemanticReview";

export function SemanticStatus({ summary }: SemanticStatusProps) {
  return (
    <Alert
      severity={
        summary.status === "complete"
          ? "success"
          : summary.status === "pending" || summary.status === "not_applicable"
            ? "info"
            : "warning"
      }
    >
      {semanticStatusLabels[summary.status]}
      {summary.pending_cards > 0 &&
        ` Ожидается карточек: ${summary.pending_cards}.`}
      {summary.needs_review > 0 &&
        ` Спорных критериев: ${summary.needs_review}.`}
    </Alert>
  );
}

export function SemanticReview(props: SemanticReviewProps) {
  const { review } = props;
  const retry = useSemanticRetry(props);
  const target = {
    lessonId: props.lessonId,
    studentId: props.studentId,
    attemptId: props.attemptId,
  };
  const memory = useAssessmentMemory(target, review.status === "succeeded");
  return (
    <Stack spacing={1}>
      <Typography variant="h6" component="h3">
        Смысловая проверка ИИ
      </Typography>
      {review.status === "failed" && (
        <Button disabled={retry.isPending} onClick={() => retry.mutate()}>
          Повторить смысловую проверку
        </Button>
      )}
      {retry.error && (
        <Alert severity="error">{getApiError(retry.error).message}</Alert>
      )}
      {(review.status === "queued" || review.status === "running") && (
        <Alert severity="info">
          {review.status === "queued"
            ? "Ожидает обработки в очереди"
            : "Модель проверяет смысл ответа"}
        </Alert>
      )}
      {review.error && <Alert severity="warning">{review.error}</Alert>}
      {review.retrieval?.status === "unavailable" && (
        <Alert severity="warning">
          Память разборов недоступна. Проверка выполнена со стандартными
          примерами.
        </Alert>
      )}
      {memory.error && (
        <Alert severity="warning">
          Не удалось загрузить ваши разборы.{" "}
          <Button onClick={() => memory.refetch()}>Повторить</Button>
        </Alert>
      )}
      {review.findings.map((finding) => (
        <SemanticFindingView key={finding.code} finding={finding}>
          {!!review.retrieval?.used_examples?.[finding.code]?.length && (
            <p>
              Использовано разборов из памяти:{" "}
              {review.retrieval.used_examples[finding.code].length}.
            </p>
          )}
          {review.status === "succeeded" && memory.isSuccess && (
            <AssessmentMemory
              target={target}
              finding={finding}
              entries={memory.data}
            />
          )}
        </SemanticFindingView>
      ))}
      {review.status === "succeeded" && review.retrieval && (
        <RetrievedExamples target={target} />
      )}
      <details>
        <summary>Процесс выполнения и подсказки</summary>
        <p>
          Сохранённых действий: {review.process.server_event_count ?? 0}.
          Изменений при вводе: {review.process.browser_event_count ?? 0}. Выдано
          подсказок: {review.process.hints_count ?? 0}.
        </p>
        <p>
          Наибольший перерыв между сохранёнными действиями:{" "}
          {review.process.max_gap_between_server_events_seconds ?? 0} с. Это не
          доказательство бездействия. Паузы, подсказки и исправления не
          штрафуются.
        </p>
        {!!review.process.delivery_gaps_reported && (
          <Alert severity="warning">
            Часть истории ввода отсутствует. Сохранения карточки и выполненные
            действия учтены.
          </Alert>
        )}
        {review.process.hints?.map((hint) => (
          <p key={hint.event_id}>
            {hint.text}
            {hint.next_action &&
              ` Следующее подтверждённое действие через ${hint.seconds_to_next_action} с.`}
          </p>
        ))}
        {review.process.hints_truncated && (
          <p>Показаны последние 20 подсказок. Полная история — в аудите.</p>
        )}
      </details>
    </Stack>
  );
}
