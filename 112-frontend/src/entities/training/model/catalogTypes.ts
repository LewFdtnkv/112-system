export type { FeatureDefinition } from "@/shared/lib/featureValues";
export const ddsStatusLabels: Record<string, string> = {
  received: "Получена службой",
  accepted: "Принята",
  not_accepted: "Не принята",
  responding: "Выезд",
  arrived: "Прибытие",
  in_progress: "Проведение работ",
  completed: "Работы завершены",
  refused: "Отказ от выполнения работ",
};

export type {
  CatalogRule,
  CatalogVersion,
  DDSContext,
  DDSPolicy,
  ProfileInput,
  ServiceProfile,
} from "../types/catalogTypes";
