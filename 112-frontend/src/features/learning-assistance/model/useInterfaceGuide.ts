import { attemptApi, learningHelpApi } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { randomUUID } from "@/shared/lib/uuid";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { LearningHelpProps } from "../types";

export function useInterfaceGuide({
  attempt,
  busy,
  beforeRequest,
}: LearningHelpProps) {
  const [paused, setPaused] = useState(false);
  const revision = attempt.dds?.revision ?? attempt.card.revision;
  const active = attempt.status === "in_progress";
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["interface-guide", attempt.id, revision],
    queryFn: () =>
      learningHelpApi.hint(attempt.id, {
        request_id: randomUUID(),
        trigger: "guided",
        level: "solution",
      }),
    enabled: active && !paused && !busy,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const hint = query.data?.hint;
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (!hint || paused || seen.current.has(hint.id)) return;
    seen.current.add(hint.id);
    void attemptApi
      .observations(attempt.id, [
        {
          command_id: randomUUID(),
          kind: "ui.hint_seen",
          value: hint.id,
          client_occurred_at: new Date().toISOString(),
        },
      ])
      .catch(() => seen.current.delete(hint.id));
  }, [attempt.id, hint, paused]);
  const check = useMutation({
    mutationFn: async () => {
      await beforeRequest?.();
      await client.invalidateQueries({
        queryKey: ["interface-guide", attempt.id],
      });
    },
  });
  const error = check.error ?? query.error;
  return {
    active,
    paused,
    setPaused,
    hint,
    check,
    busy: !!busy || query.isFetching || check.isPending,
    error: error ? getApiError(error).message : null,
  };
}
