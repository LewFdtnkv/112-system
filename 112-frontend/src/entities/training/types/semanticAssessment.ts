export interface SemanticFinding {
  code: string;
  label: string;
  verdict: "correct" | "partial" | "incorrect" | "uncertain";
  credit: number | null;
  applied: boolean;
  reason: string;
  recommendation: string;
  reference_quote: string;
  answer_quote: string;
}

export interface SemanticSummary {
  status: "pending" | "complete" | "partial" | "unavailable" | "not_applicable";
  pending_cards: number;
  failed_cards: number;
  reviewed_cards: number;
  applied_criteria: number;
  needs_review: number;
  semantic_weight_percent: number;
}

export interface SemanticReview {
  status: "queued" | "running" | "succeeded" | "failed" | "not_applicable";
  model: string | null;
  prompt_version: string | null;
  error: string | null;
  findings: SemanticFinding[];
  retrieval?: {
    status?: "ready" | "disabled" | "unavailable";
    embedding_model?: string;
    used_examples?: Record<string, string[]>;
  };
  process: {
    server_event_count?: number;
    browser_event_count?: number;
    hints_count?: number;
    hints_truncated?: boolean;
    delivery_gaps_reported?: number;
    max_gap_between_server_events_seconds?: number;
    hints?: {
      event_id: string;
      text: string;
      level: string;
      next_action: string | null;
      seconds_to_next_action: number | null;
      displayed_in_browser?: boolean;
    }[];
  };
}
