import type { SemanticReview, SemanticSummary } from "@/entities/training";

export type SemanticReviewProps = {
  review: SemanticReview;
  lessonId: string;
  studentId: string;
  attemptId: string;
};
export type SemanticStatusProps = { summary: SemanticSummary };

export type SemanticFindingViewProps = {
  finding: import("@/entities/training").SemanticFinding;
  children?: import("react").ReactNode;
};
