import { Alert } from "@mui/material";
import { semanticLabels } from "../model/semanticLabels";
import { semanticQuote } from "../model/semanticQuote";
import type { SemanticFindingViewProps } from "../types/SemanticReview";
import "../styles/semantic-feedback.scss";

export function SemanticFindingView({
  finding,
  children,
}: SemanticFindingViewProps) {
  return (
    <Alert
      className="semantic-feedback"
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
      {finding.rule_adjustment && (
        <p>
          {finding.rule_adjustment.action === "keep"
            ? `Балл по правилам сохранён: ${Math.round(finding.rule_adjustment.before * 100)}% веса поля.`
            : `Балл за поле: ${Math.round(finding.rule_adjustment.before * 100)}% → ${Math.round(finding.rule_adjustment.after * 100)}% его веса. Пересмотр ИИ учтён в оценке.`}
        </p>
      )}
      {finding.reference_quote && (
        <p className="semantic-feedback__quote">
          Основание: «{semanticQuote(finding.reference_quote)}»
        </p>
      )}
      {finding.answer_quote && (
        <p className="semantic-feedback__quote">
          В ответе: «{semanticQuote(finding.answer_quote)}»
        </p>
      )}
      {finding.recommendation && <p>{finding.recommendation}</p>}
      <small>
        {finding.rule_adjustment
          ? "Пересмотр ограничен четвертью веса поля. Итоговую оценку может изменить преподаватель."
          : finding.applied
            ? "Решение принято для расчёта; итог зависит от полноты проверки всех смысловых полей."
            : "Автоматически в балл не включено."}
      </small>
      {children}
    </Alert>
  );
}
