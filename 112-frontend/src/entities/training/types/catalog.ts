export interface Service {
  short_name?: string | null;
  id: string;
  code: string;
  name: string;
}

export interface Classifier {
  id: string;
  label: string;
  status?: string;
}

export interface ClassifierEntry {
  display_name?: string | null;
  is_popular?: boolean;
  popular_order?: number;
  notification_required?: boolean;
  id: string;
  classifier_version_id: string;
  code: string;
  section: string;
  name: string;
  conditions: Record<string, unknown>;
}

export interface Recipient {
  short_name?: string | null;
  service_id: string;
  name: string;
}

export interface ClassifierRoute {
  service_id: string;
  service_name: string;
  conditions: Record<string, unknown>;
  is_main: boolean;
}
