export const workStatusLabels = {
  assigned: "Назначено",
  in_progress: "В процессе",
  submitted: "Завершено",
};

export type { Analytics } from "../types/analytics";

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
export type { Page } from "@/shared/types/pagination";
export type {
  ScenarioDetail,
  ScenarioInput,
  ScenarioItem,
} from "../types/scenario";

export type { Attempt } from "../types/attempt";
export type {
  CardData,
  CardListItem,
  CardTemplate,
  CardTemplateInput,
} from "../types/card";
