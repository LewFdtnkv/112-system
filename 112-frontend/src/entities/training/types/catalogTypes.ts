import type {
  FeatureDefinition,
  FeatureValue,
} from "@/shared/lib/featureValues";
export interface CatalogRule {
  display_name?: string | null;
  is_popular?: boolean;
  popular_order?: number;
  notification_required?: boolean;
  code: string;
  section: string;
  name: string;
  response_scenario: string | null;
  features: FeatureDefinition[];
  routes: {
    service_code: string;
    is_main: boolean;
    when: Record<string, FeatureValue>;
  }[];
}

export interface CatalogVersion {
  id: string;
  label: string;
  status: string;
  revision: number;
}

export interface ProfileInput {
  crews?: CrewDefinition[];
  service_id: string;
  name: string;
  responsibility: string;
  procedure: string;
  territories: { code: string; name: string; description: string }[];
  objects: {
    code: string;
    name: string;
    territory_code: string | null;
    address: string;
    responsibility: string;
  }[];
  contacts: {
    code: string;
    name: string;
    description: string;
    target_service_id: string;
    position: string | null;
    endpoint_key: string;
  }[];
}

export interface ServiceProfile extends ProfileInput {
  id: string;
  version: number;
  revision: number;
  status: string;
}

export interface DDSPolicy {
  steps: { status: string; message: string; crew_number: string | null }[];
  required_crews?: { crew_code: string; status: string }[];
}

export interface CrewDefinition {
  code: string;
  name: string;
  description: string;
  contact_code: string | null;
  is_active: boolean;
}

export interface CrewCommand {
  request_id: string;
  revision: number;
  information_event_id: string;
  crew_code: string;
  status: string;
  crew_number: string | null;
  comment: string;
}

export interface DDSHistoryEntry {
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
  crew_number: string | null;
  comment: string;
  allowed_statuses: string[];
  history: DDSHistoryEntry[];
}

export interface DDSContext {
  crews?: CrewAssignment[];
  crew_goals?: { crew_code: string; name: string; status: string }[];
  profile: ServiceProfile;
  response_id: string;
  revision: number;
  status: string;
  goal: string;
  sent_at: string;
  first_decision_at: string | null;
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
    crew_number: string | null;
    comment: string;
  }[];
}
