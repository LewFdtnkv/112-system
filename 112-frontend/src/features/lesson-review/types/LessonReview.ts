import { type Grade, type WorkReview } from "@/entities/training";
import { type ReactNode } from "react";
import type { ReviewedCard } from "../model/comparison";
export type StudentResultProps = { lessonId: string };

export type GradeViewProps = { grade: Grade };

export type LessonReviewProps = {
  lessonId: string;
  studentId: string;
  actions?: ReactNode;
  renderProctoring?: (attemptId: string) => ReactNode;
  renderCardActions?: (row: ReviewedCard, rows: ReviewedCard[]) => ReactNode;
};

export type ReviewProps = {
  data: WorkReview;
  reload: () => void;
  actions?: ReactNode;
  renderProctoring?: (attemptId: string) => ReactNode;
  renderCardActions?: (row: ReviewedCard, rows: ReviewedCard[]) => ReactNode;
};

export type GradeFormProps = {
  data: WorkReview;
  reload: () => void;
  onSaved?: () => void;
};

export type ReviewDialog =
  { kind: "grade"; data: WorkReview } | { kind: "history" };
