import type { LearningPolicy, LearningResult } from "./learning";
import type { CardData } from "./card";
import type { Attempt } from "./attempt";
import type { ClassifierEntry, Recipient } from "./catalog";

export interface Grade {
  method?: "rules" | "teacher" | "hybrid";
  assessment_details?: {
    recommendations?: string[];
    semantic?: import("./semanticAssessment").SemanticSummary | null;
    assistance?: {
      issued_count: number;
      levels: Record<string, number>;
      scoring: string;
    };
    policy_version: string;
    scope: "formal_fields" | "hybrid" | "partial";
    criteria: {
      code: string;
      label: string;
      score: number;
      max_score: number;
      explanation: string;
    }[];
    unverified_fields: number;
    evaluated_cards: number;
    missed_cards?: number;
    aggregation?: string;
  } | null;
  id: string;
  score: string;
  max_score: string;
  comment: string;
  revision: number;
  created_at: string;
}

export interface AssessmentPolicy {
  version: "weighted-fields-v1";
  weights: {
    classification: number;
    notification: number;
    address: number;
    caller: number;
    victims: number;
  };
}

export interface ClientObservation {
  command_id: string;
  kind:
    | "ui.card_opened"
    | "ui.card_closed"
    | "ui.field_changed"
    | "ui.delivery_gap"
    | "ui.hint_seen";
  client_occurred_at: string;
  field?: string;
  value?: string | number | boolean | string[] | null;
}

export interface AuditEvent {
  id: string;
  attempt_id: string;
  sequence: number;
  kind: string;
  actor: string;
  occurred_at: string;
  client_occurred_at: string | null;
  payload: Record<string, unknown>;
}

export interface AuditPage {
  items: AuditEvent[];
  next_sequence: number | null;
  last_sequence: number;
}

export interface AutomaticCheck {
  method: string;
  fields: {
    field: string;
    label: string;
    expected: string;
    actual: string;
    status: "matched" | "missing" | "different" | "needs_review";
    scored: boolean;
  }[];
  matched: number;
  missing: number;
  different: number;
  needs_review: number;
  earned_points: number;
  possible_points: number;
  score_percent: number | null;
}

export interface WorkReview {
  learning: LearningPolicy;
  learning_result?: LearningResult | null;
  automatic_check: Omit<AutomaticCheck, "fields">;
  lesson_id: string;
  student_id: string;
  submitted: boolean;
  assignments: {
    semantic_review?: import("./semanticAssessment").SemanticReview | null;
    automatic_check: AutomaticCheck | null;
    assignment_id: string;
    position: number;
    source_classifier_entry?: ClassifierEntry | null;
    source_snapshot: {
      classifier_entry_id?: string;
      feature_definitions?: import("@/shared/lib/featureValues").FeatureDefinition[];
      instructions?: string;
      title: string;
      caller_message: string;
      recipients?: Recipient[];
      data: CardData;
    } | null;
    attempt: Attempt | null;
  }[];
  evaluations: Grade[];
}

export interface GradeInput {
  request_id: string;
  expected_revision: number;
  score: number;
  max_score: number;
  comment: string;
}
