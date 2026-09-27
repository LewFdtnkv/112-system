export type AIJobStatus = "queued" | "running" | "succeeded" | "failed";
export type AIJobPurpose =
  "generation" | "dds_generation" | "evaluation" | "recommendation" | "group_recommendation";
export interface AIJobItem {
  id: string;
  purpose: AIJobPurpose;
  status: AIJobStatus;
  created_by_id: string | null;
  created_by_username: string | null;
  student_id: string | null;
  student_username: string | null;
  model_version: string | null;
  retry_count: number;
  created_at: string;
  available_at: string;
  completed_at: string | null;
  lease_expires_at: string | null;
  lease_expired: boolean;
  generation_method: string | null;
  error_summary: string | null;
}
export interface AIJobDetail extends AIJobItem {
  prompt_version: string;
  idempotency_key: string;
  target_card_id: string | null;
  parent_job_id: string | null;
  card_template_id: string | null;
  scenario_version_id: string | null;
  attempt_id: string | null;
  input: Record<string, unknown>;
  context: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
}
export interface AIJobSummary {
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
}
export interface AIJobPage {
  items: AIJobItem[];
  total: number;
  limit: number;
  offset: number;
  summary: AIJobSummary;
  as_of: string;
}
export interface AIJobFilters {
  status: string;
  purpose: string;
  q: string;
  offset: number;
}
