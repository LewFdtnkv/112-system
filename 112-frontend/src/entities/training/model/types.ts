import type { UserItem } from "../types/types";
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

export type {
  Analytics,
  AssessmentPolicy,
  Assignment,
  Attempt,
  AuditEvent,
  AuditPage,
  AutomaticCheck,
  CardData,
  CardListItem,
  CardTemplate,
  CardTemplateInput,
  Classifier,
  ClassifierEntry,
  ClassifierRoute,
  ClientObservation,
  Grade,
  GradeInput,
  GroupItem,
  JournalCard,
  LessonPage,
  LessonRow,
  LessonStart,
  Page,
  Recipient,
  ScenarioDetail,
  ScenarioInput,
  ScenarioItem,
  Service,
  StudentLesson,
  UserCreate,
  UserDetail,
  UserItem,
  UserRole,
  UserUpdate,
  WorkReview,
} from "../types/types";
