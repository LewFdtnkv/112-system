import type {
  AssistancePolicy,
  LearningPolicy,
  LearningSkill,
  LessonKind,
} from "../types/learning";

export const lessonKindLabels: Record<LessonKind, string> = {
  introduction: "Освоение интерфейса",
  skill_practice: "Отработка навыка",
  practice: "Полная учебная ситуация",
  assessment: "Контрольное занятие",
  review: "Повторение",
};
export const lessonKindDescriptions: Record<LessonKind, string> = {
  introduction:
    "Пошаговое выполнение с подсветкой и объяснением каждого действия.",
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
  description: "Заполнение описания",
  dds_response: "Статусы бригад",
  dds_crews: "Назначение бригад",
};
export const assistanceLabels = {
  none: "Без подсказок",
  goal: "Напоминание цели",
  explanation: "Объяснение действия",
  solution: "Показ эталонного решения",
};
export const noAssistance = (): AssistancePolicy => ({
  max_level: "none",
  on_request: true,
});
export const defaultLearningPolicy = (): LearningPolicy => ({
  version: "learning-v2",
  kind: "practice",
  objective: "",
  target_skills: [],
  assistance: noAssistance(),
});
export const availableLessonKinds: LessonKind[] = [
  "introduction",
  "practice",
  "skill_practice",
  "review",
  "assessment",
];
