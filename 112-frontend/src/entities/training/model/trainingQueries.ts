import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { lessonApi } from "../api/lessonApi";
import { attemptApi } from "../api/attemptApi";
import type { Attempt } from "../types/attempt";
import type { Params } from "@/shared/types/query";

export const trainingKeys = {
  attempt: (id: string) => ["attempt", id] as const,
  studentLesson: (id: string) => ["student-lesson", id] as const,
  lessons: ["lessons"] as const,
  lessonList: (student: boolean, params: Params) =>
    ["lessons", student, params] as const,
};

export const attemptQueryOptions = (id: string) =>
  queryOptions({
    queryKey: trainingKeys.attempt(id),
    queryFn: ({ signal }) => attemptApi.get(id, signal),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });

export const studentLessonQueryOptions = (id: string) =>
  queryOptions({
    queryKey: trainingKeys.studentLesson(id),
    queryFn: ({ signal }) => lessonApi.studentLesson(id, signal),
    refetchInterval: 5000,
  });

export const lessonListQueryOptions = (student: boolean, params: Params) =>
  queryOptions({
    queryKey: trainingKeys.lessonList(student, params),
    queryFn: ({ signal }) => lessonApi.list(student, params, signal),
    refetchInterval: student ? 15_000 : 10_000,
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
