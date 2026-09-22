import type { LearningPolicy, LearningResult } from "./learning";
import type { DDSContext, DDSPolicy } from "../model/catalogTypes";
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface UserItem {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  email: string | null;
  is_active: boolean;
  is_admin: boolean;
  is_teacher: boolean;
  must_change_password: boolean;
  groups: string[];
  last_login_at?: string | null;
}

export type UserRole = "student" | "teacher" | "admin";

export interface UserDetail extends Omit<UserItem, "groups"> {
  role: UserRole;
  created_at: string;
  updated_at: string;
  password_changed_at: string | null;
}

export interface UserUpdate {
  reason?: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  email: string | null;
  is_active: boolean;
}

export interface UserCreate {
  username: string;
  initial_password: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  email?: string;
  role: UserRole;
}

export interface GroupItem {
  id: string;
  name: string;
  student_count: number;
}

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

export interface CardData {
  caller_name?: string | null;
  caller_phone?: string | null;
  caller_details?: Record<string, unknown> | null;
  address_text?: string | null;
  address_details?: Record<string, unknown> | null;
  description?: string | null;
  victim_details?: string | null;
  features?: Record<string, unknown> | null;
  additional_fields: Record<string, unknown>;
}

export interface CardTemplate {
  generated_by_ai?: boolean;
  revision: number;
  updated_at: string;
  created_at: string;
  classifier_label: string;
  can_edit: boolean;
  scenario_count: number;
  classifier_entry?: ClassifierEntry | null;
  recipients?: Recipient[];
  id: string;
  title: string;
  classifier_version_id: string;
  classifier_entry_id: string;
  caller_message: string | null;
  instructions: string;
  data: CardData;
  recipient_service_ids: string[];
}

export type CardListItem = Pick<
  CardTemplate,
  | "id"
  | "title"
  | "classifier_version_id"
  | "classifier_entry_id"
  | "revision"
  | "updated_at"
  | "created_at"
  | "scenario_count"
  | "classifier_label"
  | "generated_by_ai"
> & { incident_name: string; address_text: string; recipients: Recipient[] };

export type CardTemplateInput = Pick<
  CardTemplate,
  | "title"
  | "classifier_version_id"
  | "classifier_entry_id"
  | "caller_message"
  | "instructions"
  | "data"
  | "recipient_service_ids"
> & {
  use_recommended_recipients?: boolean;
};

export interface ScenarioInput {
  dds_policy?: DDSPolicy | null;
  assessment_policy?: AssessmentPolicy;
  title: string;
  category: string;
  difficulty: "basic" | "intermediate" | "advanced";
  duration_minutes: number;
  norm_seconds: number;
  instructions: string;
  status: "draft" | "published";
  role: "operator_112" | "dds";
  card_ids: string[];
  service_profile_id: string | null;
}

export interface ScenarioItem extends Omit<
  ScenarioInput,
  "card_ids" | "instructions"
> {
  id: string;
  scenario_id: string;
  version: number;
  card_count: number;
  classifier_version_id: string;
}

export interface ScenarioDetail extends Omit<ScenarioItem, "card_count"> {
  instructions: string;
  cards: {
    id: string;
    card_template_id: string;
    position: number;
    snapshot: { title: string; data: CardData };
  }[];
}

export interface LessonRow {
  learning: LearningPolicy;
  completed_at?: string | null;
  evaluation_method?: "rules" | "teacher" | null;
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

export interface JournalCard {
  id: string;
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

export interface Attempt {
  learning: LearningPolicy;
  role?: "operator_112" | "dds";
  dds?: DDSContext | null;
  id: string;
  assignment_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  caller_message: string | null;
  instructions: string;
  time_limit_seconds: number | null;
  norm_seconds: number;
  card: {
    recipient_service_ids?: string[] | null;
    id: string;
    revision: number;
    classifier_version_id: string;
    classifier_entry_id: string | null;
    status: string;
    data: CardData;
    opened_at: string | null;
    saved_at: string | null;
  };
  classifier_entry: ClassifierEntry | null;
  notified_services: Recipient[];
  recipient_services: Recipient[];
  recipient_error: string | null;
}

export interface Grade {
  method?: "rules" | "teacher";
  assessment_details?: {
    policy_version: string;
    scope: "formal_fields";
    criteria: {
      code: string;
      label: string;
      score: number;
      max_score: number;
      explanation: string;
    }[];
    unverified_fields: number;
    evaluated_cards: number;
    missed_cards?: number;
    aggregation?: string;
  } | null;
  id: string;
  score: string;
  max_score: string;
  comment: string;
  revision: number;
  created_at: string;
}

export interface AssessmentPolicy {
  version: "weighted-fields-v1";
  weights: {
    classification: number;
    notification: number;
    address: number;
    caller: number;
    victims: number;
  };
}

export interface ClientObservation {
  command_id: string;
  kind: "ui.card_opened" | "ui.card_closed" | "ui.field_changed";
  client_occurred_at: string;
  field?: string;
  value?: string | number | boolean | string[] | null;
}

export interface AuditEvent {
  id: string;
  attempt_id: string;
  sequence: number;
  kind: string;
  actor: string;
  occurred_at: string;
  client_occurred_at: string | null;
  payload: Record<string, unknown>;
}

export interface AuditPage {
  items: AuditEvent[];
  next_sequence: number | null;
  last_sequence: number;
}

export interface WorkReview {
  learning: LearningPolicy;
  learning_result?: LearningResult | null;
  automatic_check: Omit<AutomaticCheck, "fields">;
  lesson_id: string;
  student_id: string;
  submitted: boolean;
  assignments: {
    automatic_check: AutomaticCheck | null;
    assignment_id: string;
    position: number;
    source_classifier_entry?: ClassifierEntry | null;
    source_snapshot: {
      classifier_entry_id?: string;
      feature_definitions?: import("@/shared/lib/featureValues").FeatureDefinition[];
      instructions?: string;
      title: string;
      caller_message: string;
      recipients?: Recipient[];
      data: CardData;
    } | null;
    attempt: Attempt | null;
  }[];
  evaluations: Grade[];
}

export interface AutomaticCheck {
  method: string;
  fields: {
    field: string;
    label: string;
    expected: string;
    actual: string;
    status: "matched" | "missing" | "different" | "needs_review";
    scored: boolean;
  }[];
  matched: number;
  missing: number;
  different: number;
  needs_review: number;
  earned_points: number;
  possible_points: number;
  score_percent: number | null;
}

export interface GradeInput {
  request_id: string;
  expected_revision: number;
  score: number;
  max_score: number;
  comment: string;
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

export interface Analytics {
  total: number;
  submitted: number;
  graded: number;
  average_score_percent: number | null;
  scenarios: Page<{
    scenario_version_id: string;
    title: string;
    total: number;
    submitted: number;
    graded: number;
    average_score_percent: number | null;
  }>;
}
