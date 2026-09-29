import { useDebounced } from "@/shared/lib/useDebounced";
import { attemptApi, learningHelpApi } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { randomUUID } from "@/shared/lib/uuid";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useGuideSession } from "./guideSession";
import { useEffect, useRef } from "react";
import type { LearningHelpProps } from "../types";

export function useInterfaceGuide({
  attempt,
  busy,
  beforeRequest,
  activity = 0,
}: LearningHelpProps) {
  const { paused, setPaused } = useGuideSession();
  const revision = attempt.dds?.revision ?? attempt.card.revision;
  const active = attempt.status === "in_progress";
  const client = useQueryClient();
  const stableActivity = useDebounced(activity, 2000);
  const settled = activity === stableActivity;
  const task = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!settled)
      void client.cancelQueries({ queryKey: ["interface-guide", attempt.id] });
  }, [activity, settled, client, attempt.id]);
  const query = useQuery({
    queryKey: ["interface-guide", attempt.id, revision, stableActivity],
    queryFn: ({ signal }) =>
      learningHelpApi.hint(
        attempt.id,
        {
          request_id: randomUUID(),
          trigger: "guided",
          level: "solution",
          check_task: stableActivity ? task.current : undefined,
        },
        signal,
      ),
    enabled: active && !paused && !busy && settled,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const hint = query.data?.hint;
  useEffect(() => {
    task.current = hint?.task;
  }, [hint?.task]);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (!hint || paused || !settled || busy || seen.current.has(hint.id))
      return;
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
  }, [attempt.id, hint, paused, settled, busy]);
  const check = useMutation({
    mutationFn: async () => {
      await beforeRequest?.();
      if (hint?.advance === "confirm") {
        const response = await learningHelpApi.hint(attempt.id, {
          request_id: randomUUID(),
          trigger: "guided",
          level: "solution",
          confirm_hint_id: hint.id,
        });
        client.setQueryData(
          ["interface-guide", attempt.id, response.revision, stableActivity],
          response,
        );
      }
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
    hint: hint
      ? {
          ...hint,
          correction:
            settled &&
            !busy &&
            !query.isFetching &&
            query.data?.revision === revision
              ? hint.correction
              : null,
        }
      : hint,
    check,
    busy: !!busy || !settled || query.isFetching || check.isPending,
    error: error ? getApiError(error).message : null,
  };
}
