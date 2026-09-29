import type { LessonRow } from "./types";
export const percentText = (value: number | null) =>
  value === null
    ? "Нет оценок"
    : `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)}%`;
export const lessonPercent = (row: Pick<LessonRow, "score" | "max_score">) =>
  row.score === null || !Number(row.max_score)
    ? null
    : (Number(row.score) * 100) / Number(row.max_score);

export type { StudentOverview } from "../types/studentOverview";
