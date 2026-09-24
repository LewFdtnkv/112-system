import { InterfaceGuide } from "./InterfaceGuide";
import { learningSkillLabels } from "@/entities/training";
import type { LearningSkill } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { useLearningHelp } from "../model/useLearningHelp";
import type { LearningHelpProps } from "../types";
import "../styles/learning-help.scss";
export function LearningHelp(props: LearningHelpProps) {
  return props.attempt.learning.kind === "introduction" ? (
    <InterfaceGuide {...props} />
  ) : (
    <ContextualHelp {...props} />
  );
}
function ContextualHelp(props: LearningHelpProps) {
  const { enabled, hint, request, next, dismiss } = useLearningHelp(props);
  const scope = props.attempt.exercise_scope;
  if (!enabled && !scope) return null;
  return (
    <aside className="learning-help" aria-label="Учебная помощь">
      {scope && (
        <p className="learning-help__scope">
          Выполните:{" "}
          {scope.map((s) => learningSkillLabels[s as LearningSkill]).join(", ")}
          . Остальные элементы подготовлены и не оцениваются.
        </p>
      )}
      {enabled && (
        <div className="learning-help__controls">
          <strong>Учебная помощь</strong>
          {props.attempt.learning.assistance.on_request && (
            <button
              className="arm-small-button"
              disabled={props.busy || request.isPending}
              onClick={() =>
                request.mutate({ trigger: "request", level: "goal" })
              }
            >
              Напомнить цель
            </button>
          )}
          {next && (
            <button
              className="arm-small-button"
              disabled={props.busy || request.isPending}
              onClick={() =>
                request.mutate({ trigger: "request", level: next })
              }
            >
              {next === "explanation"
                ? "Объяснить действие"
                : "Показать эталонное решение"}
            </button>
          )}
          {request.isPending && <span>Проверяем выполненные действия…</span>}
        </div>
      )}
      {hint && (
        <div className="learning-help__message" role="status">
          <p>{hint.text}</p>
          <button
            className="arm-small-button"
            aria-label="Скрыть подсказку"
            onClick={dismiss}
          >
            ×
          </button>
        </div>
      )}
      {request.error && (
        <p role="alert">{getApiError(request.error).message}</p>
      )}
    </aside>
  );
}
