import { activityApi } from "@/entities/training";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export function useMessageSummary() {
  return useQuery({
    queryKey: ["messages", "summary"],
    queryFn: ({ signal }) => activityApi.messageSummary(signal),
    refetchInterval: 15000,
  });
}

export function useStudentMessages(compact: boolean, unreadOnly = false) {
  const [page, setPage] = useState(0);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["messages", { page, includeAdvice: !compact, unreadOnly }],
    queryFn: ({ signal }) =>
      activityApi.messages(page * 20, !compact, signal, unreadOnly),
    refetchOnMount: unreadOnly ? "always" : true,
    refetchInterval: compact ? 5000 : 15000,
  });
  const read = useMutation({
    mutationFn: activityApi.readMessage,
    onSuccess: () => {
      if (unreadOnly && page > 0 && query.data?.items.length === 1)
        setPage(page - 1);
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
