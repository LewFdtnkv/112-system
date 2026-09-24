import type { FeatureValue } from "@/shared/lib/featureValues";

export interface GenerationParameters {
  mode?: "assisted" | "template";
  classifier_version_id?: string | null;
  classifier_entry_id?: string | null;
  service_ids?: string[] | null;
  has_victims?: boolean | null;
  victims_count?: number | null;
  refused_ambulance?: boolean | null;
  blocked?: boolean | null;
  message_format?: "call" | "sms" | null;
  caller_information?: "full" | "name_only" | "anonymous" | null;
  address_format?: "structured" | "descriptive" | null;
  address_description?: string | null;
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
  template_count: number;
  template_version: string;
  supported_types: string[];
  addresses: { id: string; locality: string; street: string; house: string }[];
  address_source: { source: string; source_url: string; license: string };
  object: string[];
  patronymic_probability: number;
  gender: { value: string; label: string }[];
  time_of_day: { value: string; label: string }[];
  caller_state: { value: string; label: string }[];
  detail_level: { value: string; label: string }[];
  message_format: { value: string; label: string }[];
  caller_information: { value: string; label: string }[];
  address_format: { value: string; label: string }[];
  max_count: number;
}
