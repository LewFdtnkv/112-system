import type { LearningPolicy } from "./learning";
import type { Page } from "./pagination";

export interface LessonRow {
  learning: LearningPolicy;
  completed_at?: string | null;
  evaluation_method?: "rules" | "teacher" | "hybrid" | null;
  lesson_id: string;
  title: string;
  student_id: string;
  student_name: string;
  scenario_version_id: string;
  scenario_title: string;
  group_name: string | null;
  role: "operator_112" | "dds";
  available_from?: string | null;
  available_until?: string | null;
  started_at: string | null;
  ended_at: string | null;
  status: string;
  work_status: "assigned" | "in_progress" | "submitted";
  card_count: number;
  completed_count: number;
  score: string | null;
  max_score: string | null;
  evaluation_revision: number | null;
}

export interface LessonPage extends Page<LessonRow> {
  assigned_count: number;
  in_progress_count: number;
  submitted_count: number;
  graded_count: number;
}

export interface LessonStart {
  request_id: string;
  group_id?: string;
  group_ids?: string[];
  student_ids?: string[];
  available_from?: string;
  available_until?: string;
  student_id?: string;
  scenario_version_id: string;
  title?: string;
  learning: LearningPolicy;
  time_limit_seconds?: number;
}
