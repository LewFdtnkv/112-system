import { trainingApi } from "@/entities/training";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SemanticReviewProps } from "../types/SemanticReview";

export function useSemanticRetry({
  lessonId,
  studentId,
  attemptId,
}: SemanticReviewProps) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => trainingApi.retrySemantic(lessonId, studentId, attemptId),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: ["work-review", lessonId, studentId],
      }),
  });
}
