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
}
export interface UserCreate {
  username: string;
  initial_password: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  email?: string;
  is_admin: boolean;
  is_teacher: boolean;
}
export interface GroupItem {
  id: string;
  name: string;
  student_count: number;
}
export interface Service {
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
  id: string;
  classifier_version_id: string;
  code: string;
  section: string;
  name: string;
  conditions: Record<string, unknown>;
}
export interface Recipient {
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
  id: string;
  title: string;
  classifier_version_id: string;
  classifier_entry_id: string;
  caller_message: string;
  instructions: string;
  data: CardData;
  recipient_service_ids: string[];
}
export type CardListItem = Pick<
  CardTemplate,
  "id" | "title" | "classifier_version_id" | "classifier_entry_id"
>;
export type CardTemplateInput = Omit<CardTemplate, "id">;
export interface ScenarioInput {
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
  lesson_id: string;
  title: string;
  student_id: string;
  student_name: string;
  scenario_version_id: string;
  scenario_title: string;
  group_name: string | null;
  role: "operator_112" | "dds";
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
  id: string;
  title: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  work_status: string;
  assignments: Assignment[];
}
export interface Attempt {
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
  id: string;
  score: string;
  max_score: string;
  comment: string;
  revision: number;
  created_at: string;
}
export interface WorkReview {
  lesson_id: string;
  student_id: string;
  submitted: boolean;
  assignments: {
    assignment_id: string;
    position: number;
    source_classifier_entry?: ClassifierEntry | null;
    source_snapshot: {
      title: string;
      caller_message: string;
      recipients?: Recipient[];
      data: CardData;
    } | null;
    attempt: Attempt | null;
  }[];
  evaluations: Grade[];
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
  group_id: string;
  student_id?: string;
  scenario_version_id: string;
  title?: string;
  mode: string;
  time_limit_seconds?: number;
  hint_delay_seconds?: number;
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
export const workStatusLabels = {
  assigned: "Назначено",
  in_progress: "В процессе",
  submitted: "Завершено",
};
export const userName = (
  user: Pick<UserItem, "username" | "first_name" | "last_name" | "middle_name">,
) =>
  [user.last_name, user.first_name, user.middle_name]
    .filter(Boolean)
    .join(" ") || user.username;
