import type { AIJobPurpose, AIJobStatus } from "../types";
export const jobStatuses: Record<AIJobStatus, string> = {
  queued: "В очереди",
  running: "В работе",
  succeeded: "Успешно",
  failed: "Ошибка",
};
export const jobPurposes: Record<AIJobPurpose, string> = {
  generation: "Генерация карточки",
  dds_generation: "Упражнение ДДС",
  evaluation: "Оценивание",
  recommendation: "Рекомендации",
};
export const jobMethods: Record<string, string> = {
  assisted: "Текст ИИ проверен",
  template: "Заготовка без ИИ",
  "template-fallback": "Использована заготовка",
};
