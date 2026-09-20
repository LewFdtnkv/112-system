import type { LessonRow, Page, UserDetail } from "./types";
export interface StudentOverview {
  user: UserDetail;
  groups: string[];
  active_lessons: Page<LessonRow>;
  performance: {
    total_lessons: number;
    completed_lessons: number;
    graded_lessons: number;
    overall_percent: number | null;
    recent_percent: number | null;
    recent_count: number;
    recent_limit: number;
    recent_lessons: LessonRow[];
  };
}
export const percentText = (value: number | null) =>
  value === null
    ? "Нет оценок"
    : `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)}%`;
export const lessonPercent = (row: Pick<LessonRow, "score" | "max_score">) =>
  row.score === null || !Number(row.max_score)
    ? null
    : (Number(row.score) * 100) / Number(row.max_score);
