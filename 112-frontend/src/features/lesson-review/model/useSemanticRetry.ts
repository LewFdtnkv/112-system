import { reviewApi } from "@/entities/training";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SemanticReviewProps } from "../types/SemanticReview";

export function useSemanticRetry({
  lessonId,
  studentId,
  attemptId,
}: SemanticReviewProps) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => reviewApi.retrySemantic(lessonId, studentId, attemptId),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: ["work-review", lessonId, studentId],
      }),
  });
}
