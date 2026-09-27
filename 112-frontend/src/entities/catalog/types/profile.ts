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

export interface CrewDefinition {
  code: string;
  name: string;
  description: string;
  contact_code: string | null;
  is_active: boolean;
}
