import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { trainingApi } from "../api/trainingApi";
import type { Attempt } from "../types/types";

export const trainingKeys = {
  attempt: (id: string) => ["attempt", id] as const,
  studentLesson: (id: string) => ["student-lesson", id] as const,
  lessons: ["lessons"] as const,
};

export const attemptQueryOptions = (id: string) =>
  queryOptions({
    queryKey: trainingKeys.attempt(id),
    queryFn: ({ signal }) => trainingApi.attempt(id, signal),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

export const studentLessonQueryOptions = (id: string) =>
  queryOptions({
    queryKey: trainingKeys.studentLesson(id),
    queryFn: ({ signal }) => trainingApi.studentLesson(id, signal),
    refetchInterval: 5000,
  });

/** Editors observe the same server snapshot as the journal; drafts stay separate. */
export function useAttemptSnapshot(initial: Attempt) {
  const client = useQueryClient();
  const query = useQuery({
    ...attemptQueryOptions(initial.id),
    initialData: initial,
    enabled: false,
  });
  return {
    ...query,
    update: (value: Attempt) =>
      client.setQueryData(trainingKeys.attempt(value.id), value),
    latest: () =>
      client.getQueryData<Attempt>(trainingKeys.attempt(initial.id)) ?? initial,
    cancelRead: () =>
      client.cancelQueries({
        queryKey: trainingKeys.attempt(initial.id),
        exact: true,
      }),
  };
}
