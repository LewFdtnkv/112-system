import { Alert, Button, Stack, Typography } from "@mui/material";
import { getApiError } from "@/shared/api";
import { useSemanticRetry } from "../model/useSemanticRetry";
import { semanticLabels, semanticStatusLabels } from "../model/semanticLabels";
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
      {review.findings.map((finding) => (
        <Alert
          key={finding.code}
          severity={
            !finding.applied
              ? "warning"
              : finding.verdict === "correct"
                ? "success"
                : finding.verdict === "partial"
                  ? "warning"
                  : "error"
          }
        >
          <strong>
            {finding.label}: {semanticLabels[finding.verdict]}
          </strong>
          <p>{finding.reason}</p>
          {finding.reference_quote && (
            <p>Основание: «{finding.reference_quote}»</p>
          )}
          {finding.answer_quote && <p>В ответе: «{finding.answer_quote}»</p>}
          {finding.recommendation && <p>{finding.recommendation}</p>}
          <small>
            {finding.applied
              ? "Решение принято для расчёта; итог зависит от полноты проверки всех смысловых полей."
              : "Автоматически в балл не включено."}
          </small>
        </Alert>
      ))}
      <Typography variant="body2">
        Модель: {review.model ?? "—"} · Рубрика: {review.prompt_version ?? "—"}
      </Typography>
      <details>
        <summary>Процесс выполнения и подсказки</summary>
        <p>
          Подтверждённых событий: {review.process.server_event_count ?? 0}.
          Наблюдений браузера: {review.process.browser_event_count ?? 0}. Выдано
          подсказок: {review.process.hints_count ?? 0}.
        </p>
        <p>
          Максимальный промежуток между серверными событиями:{" "}
          {review.process.max_gap_between_server_events_seconds ?? 0} с. Это не
          доказательство бездействия. Паузы, подсказки и исправления не
          штрафуются.
        </p>
        {!!review.process.delivery_gaps_reported && (
          <Alert severity="warning">
            Браузер сообщил о потере части наблюдений. Серверные действия
            сохранены.
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
