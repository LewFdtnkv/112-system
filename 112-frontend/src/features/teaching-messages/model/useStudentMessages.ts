import { activityApi } from "@/entities/training";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export function useStudentMessages(compact: boolean) {
  const [page, setPage] = useState(0);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["messages", { page, includeAdvice: !compact }],
    queryFn: ({ signal }) => activityApi.messages(page * 20, !compact, signal),
    refetchInterval: compact ? 5000 : 15000,
  });
  const read = useMutation({
    mutationFn: activityApi.readMessage,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["messages"] });
    },
  });
  return { page, setPage, query, read };
}

export function useRecommendationFeedback(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (helpful: boolean) =>
      activityApi.recommendationFeedback(id, helpful),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["messages"] });
    },
  });
}
