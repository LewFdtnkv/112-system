export type { FeatureDefinition } from "@/shared/lib/featureValues";
export const ddsStatusLabels: Record<string, string> = {
  received: "Получена службой",
  accepted: "Принята",
  not_accepted: "Не принята",
  responding: "Начало реагирования",
  arrived: "Прибытие",
  in_progress: "Проведение работ",
  completed: "Работы завершены",
  refused: "Отказ от выполнения работ",
};

export const crewStatusLabels: Record<string, string> = {
  assigned: "Назначена",
  responding: "Начало реагирования",
  arrived: "Прибытие",
  in_progress: "Проведение работ",
  completed: "Работы завершены",
  cancelled: "Назначение отменено",
};

export type {
  CatalogRule,
  CatalogVersion,
  DDSContext,
  DDSPolicy,
  ProfileInput,
  ServiceProfile,
  CrewDefinition,
  CrewAssignment,
  CrewCommand,
  DDSHistoryEntry,
} from "../types/catalogTypes";
