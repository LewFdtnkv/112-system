import type { UserItem } from "../types/user";
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

export type { Analytics } from "../types/analytics";
export type {
  Classifier,
  ClassifierEntry,
  ClassifierRoute,
  Recipient,
  Service,
} from "../types/catalog";
export type {
  AssessmentPolicy,
  AuditEvent,
  AuditPage,
  AutomaticCheck,
  ClientObservation,
  Grade,
  GradeInput,
  WorkReview,
} from "../types/review";
export type {
  Assignment,
  JournalCard,
  StudentLesson,
} from "../types/workspace";
export type { LessonPage, LessonRow, LessonStart } from "../types/lesson";
export type { Page } from "../types/pagination";
export type {
  ScenarioDetail,
  ScenarioInput,
  ScenarioItem,
} from "../types/scenario";
export type {
  GroupItem,
  UserCreate,
  UserDetail,
  UserItem,
  UserRole,
  UserUpdate,
} from "../types/user";
export type { Attempt } from "../types/attempt";
export type {
  CardData,
  CardListItem,
  CardTemplate,
  CardTemplateInput,
} from "../types/card";
