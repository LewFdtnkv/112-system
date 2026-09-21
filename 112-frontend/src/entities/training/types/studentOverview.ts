import type { LessonRow, Page, UserDetail } from "../model/types";
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
