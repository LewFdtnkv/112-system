import type {
  AssistancePolicy,
  LearningPolicy,
  LearningSkill,
  LessonKind,
} from "../types/learning";

export const lessonKindLabels: Record<LessonKind, string> = {
  introduction: "Освоение интерфейса",
  worked_example: "Разбор примера",
  skill_practice: "Отработка навыка",
  practice: "Полная учебная ситуация",
  assessment: "Контрольное занятие",
  review: "Повторение",
};
export const lessonKindDescriptions: Record<LessonKind, string> = {
  introduction: "Первые шаги за рабочим местом. Появится позже.",
  worked_example: "Пошаговый разбор решения. Появится позже.",
  skill_practice: "Сосредоточиться на выбранных навыках.",
  practice: "Пройти все карточки сценария целиком.",
  assessment: "Проверить знания без учебных подсказок.",
  review: "Повторить выбранные темы на новом задании.",
};
export const learningSkillLabels: Record<LearningSkill, string> = {
  interface: "Работа с интерфейсом",
  address: "Адрес происшествия",
  caller: "Сведения о заявителе",
  classification: "Тип и признаки происшествия",
  notification: "Выбор и оповещение служб",
  description: "Полнота описания",
  dds_response: "Обработка карточки ДДС",
  dds_crews: "Работа с бригадами",
};
export const assistanceLabels = {
  none: "Без подсказок",
  text: "Текстовые подсказки",
  visual: "Подсказки с подсветкой",
};
export const noAssistance = (): AssistancePolicy => ({
  mode: "none",
  max_level: "goal",
  on_request: false,
  idle_seconds: null,
});
export const defaultLearningPolicy = (): LearningPolicy => ({
  version: "learning-v1",
  kind: "practice",
  objective: "",
  target_skills: [],
  assistance: noAssistance(),
});
export const availableLessonKinds: LessonKind[] = [
  "practice",
  "skill_practice",
  "review",
  "assessment",
];
