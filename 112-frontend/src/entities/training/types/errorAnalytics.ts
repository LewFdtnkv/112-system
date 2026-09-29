import type { Page } from "@/shared/types/pagination";

export interface ErrorMeasure {
  checked: number;
  errors: number;
  error_percent: number;
}
export interface ErrorField extends ErrorMeasure {
  key: string;
  label: string;
  role: string;
}
export interface ErrorCard extends ErrorMeasure {
  key: string;
  title: string;
  role: string;
  students: number;
  skills: Record<string, ErrorMeasure>;
  fields: ErrorField[];
  examples: {
    lesson_id: string;
    student_id: string;
    student: string;
    position: number;
  }[];
}
export interface ErrorAnalytics {
  summary: ErrorMeasure & {
    students: number;
    teacher_reviewed: number;
    pending_ai: number;
    incomplete_ai: number;
    ungraded: number;
  };
  skills: { key: string; label: string }[];
  fields: ErrorField[];
  cards: Page<ErrorCard>;
}
