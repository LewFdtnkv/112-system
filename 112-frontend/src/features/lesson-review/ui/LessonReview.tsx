import { reviewApi } from "@/entities/training";
import { QueryState } from "@/shared/ui/QueryState";
import { useQuery } from "@tanstack/react-query";
import type { LessonReviewProps } from "../types/LessonReview";
import { ReviewContent } from "./ReviewContent";

export function LessonReview({
  lessonId,
  studentId,
  renderProctoring,
  renderCardActions,
}: LessonReviewProps) {
  const query = useQuery({
    queryKey: ["work-review", lessonId, studentId],
    queryFn: ({ signal }) => reviewApi.review(lessonId, studentId, signal),
    refetchInterval: 5000,
  });
  return (
    <QueryState
      pending={query.isPending}
      error={query.error}
      retry={() => void query.refetch()}
    >
      {query.data && (
        <ReviewContent
          data={query.data}
          reload={() => void query.refetch()}
          renderProctoring={renderProctoring}
          renderCardActions={renderCardActions}
        />
      )}
    </QueryState>
  );
}
