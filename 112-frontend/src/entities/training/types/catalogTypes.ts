import type { ServiceProfile } from "@/entities/catalog/@x/training";
export interface DDSPolicy {
  crew_calls_required?: boolean;
  workflow?: "service-v1" | "crews-v1" | "crews-v2";
  steps: { status: string; message: string; crew_number: string | null }[];
  required_crews?: { crew_code: string; status: string }[];
}

export interface CrewCommand {
  request_id: string;
  revision: number;
  information_event_id: string;
  crew_code: string;
  status: string;
  crew_number: string | null;
  comment?: string;
}

export interface DDSHistoryEntry {
  prepared?: boolean;
  id: string;
  at: string;
  status: string;
  comment: string;
  crew_number: string | null;
}

export interface CrewAssignment {
  id: string;
  crew_code: string;
  name: string;
  description: string;
  contact_code: string | null;
  status: string;
  assigned_at?: string;
  status_updated_at?: string;
  crew_number: string | null;
  comment: string;
  allowed_statuses: string[];
  history: DDSHistoryEntry[];
}

export interface DDSTimingMeasure {
  at: string | null;
  seconds: number;
  norm_seconds: number;
  state: "waiting" | "overdue" | "missing" | "late" | "on_time";
}
export type DDSTiming = Record<"opening" | "first_record", DDSTimingMeasure>;

export interface DDSContext {
  timing?: DDSTiming | null;
  card_exercise?: boolean;
  crew_messages?: { crew_code: string; message: string }[];
  workflow?: "crews-v1" | "crews-v2" | "service-v1";
  crews?: CrewAssignment[];
  crew_goals?: { crew_code: string; name: string; status: string }[];
  profile: ServiceProfile;
  response_id: string;
  revision: number;
  status: string;
  goal: string;
  sent_at: string;
  first_decision_at: string | null;
  reaction_norm_seconds?: number | null;
  reaction_end_at?: string | null;
  crew_number: string | null;
  comment: string;
  allowed_statuses: string[];
  can_finish: boolean;
  information: { id: string; message: string } | null;
  history: {
    id: string;
    at: string;
    status: string;
    comment: string;
    crew_number: string | null;
  }[];
  responses: {
    service_id: string;
    name: string;
    short_name?: string | null;
    status: string;
    added_at?: string;
    received_at?: string | null;
    status_updated_at?: string;
    crew_number: string | null;
    comment: string;
  }[];
}
