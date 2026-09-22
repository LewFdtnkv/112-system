import type { FeatureValue } from "@/shared/lib/featureValues";

export interface GenerationParameters {
  classifier_version_id?: string | null;
  classifier_entry_id?: string | null;
  service_ids?: string[] | null;
  gender?: "male" | "female" | null;
  age?: number | null;
  caller_name?: string | null;
  locality?: string | null;
  street?: string | null;
  house?: string | null;
  object?: string | null;
  time_of_day?: "morning" | "day" | "evening" | "night" | null;
  caller_state?: "calm" | "worried" | "panicked" | null;
  detail_level?: "brief" | "normal" | "detailed" | null;
  feature_answers?: Record<string, FeatureValue>;
}
export interface GenerationJob {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  created_at: string;
  completed_at: string | null;
  card_template_id: string | null;
  title: string;
  incident_name: string;
  address_text: string;
  services: string[];
  error: string | null;
  attempts: number;
  facts: Record<string, unknown>;
}
export interface GenerationOptions {
  locality: string[];
  street: string[];
  house: string[];
  object: string[];
  caller_name: Record<"male" | "female", string[]>;
  gender: { value: string; label: string }[];
  time_of_day: { value: string; label: string }[];
  caller_state: { value: string; label: string }[];
  detail_level: { value: string; label: string }[];
  max_count: number;
}
