import type { SemanticReview, SemanticSummary } from "@/entities/training";

export type SemanticReviewProps = {
  review: SemanticReview;
  lessonId: string;
  studentId: string;
  attemptId: string;
};
export type SemanticStatusProps = { summary: SemanticSummary };
