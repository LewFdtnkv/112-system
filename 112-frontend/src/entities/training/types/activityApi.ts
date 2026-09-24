export interface Message {
  id: string;
  text: string;
  created_at: string;
  read_at: string | null;
  source: "teacher" | "learning_advice";
  details: RecommendationDetails;
  teacher_name: string;
  group_name: string | null;
}

export interface Activity {
  id: string;
  occurred_at: string;
  kind: string;
  actor_id: string | null;
  reason: string;
}

export interface ProctoringEvent {
  id: string;
  kind: string;
  created_at: string;
  client_occurred_at: string;
}

export type FocusKind =
  "tab.visible" | "tab.hidden" | "window.focus" | "window.blur";

export interface RecommendationDetails {
  role?: "operator_112" | "dds";
  mode?: "ai" | "methodical_fallback";
  obsolete?: boolean;
  feedback?: "helpful" | "not_helpful";
  suggestions?: {
    skill: string;
    label: string;
    lesson_id: string | null;
    lesson_title: string | null;
  }[];
}
