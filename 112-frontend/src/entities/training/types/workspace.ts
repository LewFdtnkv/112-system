import type { LearningPolicy, LearningResult } from "./learning";

export interface JournalCard {
  pauses?: { start: string; end: string | null }[];
  id: string;
  display_number: number;
  started_at: string;
  status: string;
  address_text: string | null;
  description: string | null;
  caller_name: string | null;
  caller_phone: string | null;
  classifier_entry_id: string | null;
  category_name: string | null;
}

export interface Assignment {
  scheduled_at?: string | null;
  received_at?: string | null;
  first_opened_at?: string | null;
  first_response_at?: string | null;
  response_norm_seconds?: number | null;
  deadline_at?: string | null;
  card: JournalCard | null;
  id: string;
  position: number;
  title: string;
  role: string;
  available: boolean;
  attempt_id: string | null;
  status: string;
}

export interface StudentLesson {
  delivery?: "sequential" | "dds-stream-v1";
  execution_started_at?: string | null;
  execution_ended_at?: string | null;
  paused_at?: string | null;
  presence_session_id?: string | null;
  deadline_at?: string | null;
  time_limit_seconds?: number | null;
  server_time?: string | null;
  learning: LearningPolicy;
  learning_result?: LearningResult | null;
  id: string;
  title: string;
  status: string;
  available_from?: string | null;
  available_until?: string | null;
  started_at: string | null;
  ended_at: string | null;
  work_status: string;
  assignments: Assignment[];
}
