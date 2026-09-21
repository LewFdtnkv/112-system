import type { CriterionKey, Evaluation } from "../types/evaluation";

export const criterionOrder: readonly CriterionKey[] = [
  "field_accuracy",
  "text_relevance",
  "completeness",
  "routing",
  "timing",
  "grammar",
  "protocol",
];

export const criterionLabels: Record<CriterionKey, string> = {
  field_accuracy: "Точность полей",
  text_relevance: "Смысл текста",
  completeness: "Заполненность",
  routing: "Выбор служб",
  timing: "Норматив времени",
  grammar: "Грамотность",
  protocol: "Порядок действий",
};

export const getScorePercent = (evaluation: Evaluation) =>
  evaluation.maxScore === 0
    ? 0
    : Math.round((evaluation.totalScore / evaluation.maxScore) * 100);

export const getCriterionScore = (evaluation: Evaluation, key: CriterionKey) =>
  evaluation.criteria.find((criterion) => criterion.key === key);

export type {
  CriterionKey,
  CriterionScore,
  Evaluation,
  GrammarIssue,
} from "../types/evaluation";
