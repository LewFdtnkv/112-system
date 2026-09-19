import type { IncidentCardFields } from "@/entities/incident-card";

export type CriterionKey =
  | "field_accuracy"
  | "text_relevance"
  | "completeness"
  | "routing"
  | "timing"
  | "grammar"
  | "protocol";

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

export interface CriterionScore {
  key: CriterionKey;
  score: number;
  maxScore: number;
  findings: readonly string[];
}

export interface GrammarIssue {
  field: keyof IncidentCardFields;
  message: string;
}

export interface Evaluation {
  id: string;
  sessionId: string;
  criteria: readonly CriterionScore[];
  grammarIssues: readonly GrammarIssue[];
  timingDeltaSeconds: number;
  totalScore: number;
  maxScore: number;
  passed: boolean;
  source: "auto" | "auto_with_expert_override";
  expertComment: string | null;
  evaluatedAt: string;
}

export const getScorePercent = (evaluation: Evaluation) =>
  evaluation.maxScore === 0
    ? 0
    : Math.round((evaluation.totalScore / evaluation.maxScore) * 100);

export const getCriterionScore = (evaluation: Evaluation, key: CriterionKey) =>
  evaluation.criteria.find((criterion) => criterion.key === key);
