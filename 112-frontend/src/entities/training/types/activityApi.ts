export interface MessageSummary {
  unread_count: number;
}

export interface MonitoringRow {
  attempt_id: string;
  student_id: string;
  student_name: string;
  title: string;
  visibility: string | null;
  focus: string | null;
  last_seen: string | null;
  hidden_count: number;
}

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
