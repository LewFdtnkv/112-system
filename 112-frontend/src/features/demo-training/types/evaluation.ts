import type { IncidentCardFields } from "@/entities/incident-card";
export type CriterionKey =
  | "field_accuracy"
  | "text_relevance"
  | "completeness"
  | "routing"
  | "timing"
  | "grammar"
  | "protocol";

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
