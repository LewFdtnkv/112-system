import { reviewApi } from "@/entities/training";
import { useQuery } from "@tanstack/react-query";

export function useStudentFeedback(lessonId: string) {
  return useQuery({
    queryKey: ["student-feedback", lessonId],
    queryFn: ({ signal }) => reviewApi.feedback(lessonId, signal),
    refetchInterval: (query) =>
      !query.state.data ||
      !query.state.data.submitted ||
      query.state.data.cards.some(
        (card) => card.status === "queued" || card.status === "running",
      )
        ? 15000
        : false,
  });
}
