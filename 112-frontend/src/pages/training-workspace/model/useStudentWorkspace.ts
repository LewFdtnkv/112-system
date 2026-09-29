import {
  lessonApi,
  trainingKeys,
  attemptQueryOptions,
} from "@/entities/training";
import { useLessonPresence } from "./useLessonPresence";
import { journalCard } from "@/features/incident-editing";
import { useProctoring } from "@/features/proctoring";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type {
  WorkspaceProps,
  OpenAttempt,
} from "../types/TrainingWorkspacePage";

export function useStudentWorkspace({ lesson }: WorkspaceProps) {
  const exit = useLessonPresence(lesson);
  const [confirmStart, setConfirmStart] = useState(false);
  const [now, setNow] = useState(Date.now);
  const client = useQueryClient();
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(
    null,
  );
  const attemptQuery = useQuery({
    ...attemptQueryOptions(selectedAttemptId ?? ""),
    enabled: !!selectedAttemptId,
  });
  const attempt = selectedAttemptId ? attemptQuery.data : undefined;
  const stream = lesson.delivery === "dds-stream-v1";
  const isDDS = lesson.assignments.some((a) => a.role === "dds");
  const next = lesson.assignments.find((a) => a.available);
  const activeAttempt = lesson.assignments.find(
    (a) => a.status === "in_progress",
  );
  const proctoringFailed = useProctoring(
    activeAttempt?.attempt_id ?? undefined,
    !!activeAttempt && !lesson.paused_at,
  );
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const receivedAt = client.getQueryState(
    trainingKeys.studentLesson(lesson.id),
  )?.dataUpdatedAt;
  const serverOffset =
    lesson.server_time && receivedAt
      ? Date.parse(lesson.server_time) - receivedAt
      : 0;
  const deadline = lesson.deadline_at
    ? Date.parse(lesson.deadline_at)
    : lesson.available_until
      ? Date.parse(lesson.available_until)
      : Infinity;
  const remaining = Number.isFinite(deadline)
    ? Math.max(0, Math.ceil((deadline - now - serverOffset) / 1000))
    : null;
  const unopened =
    ((!lesson.execution_started_at &&
      !lesson.assignments.some((a) => a.attempt_id)) ||
      !!lesson.paused_at) &&
    lesson.work_status !== "submitted";

  const refresh = () => {
    void client.invalidateQueries({
      queryKey: trainingKeys.studentLesson(lesson.id),
    });
    void client.invalidateQueries({ queryKey: trainingKeys.lessons });
  };
  const begin = useMutation({
    mutationFn: () => lessonApi.startExecution(lesson.id),
    onSuccess: (data) => {
      client.setQueryData(trainingKeys.studentLesson(lesson.id), data);
      void client.invalidateQueries({ queryKey: ["attempt"] });
      void client.invalidateQueries({ queryKey: ["student-overview"] });
      refresh();
    },
  });
  const start = useMutation({
    mutationFn: lessonApi.startAttempt,
    onSuccess: (data) => {
      client.setQueryData(trainingKeys.attempt(data.id), data);
      setSelectedAttemptId(data.id);
      refresh();
    },
  });
  const openAttempt = ({ assignmentId, attemptId }: OpenAttempt) => {
    start.reset();
    if (attemptId && attemptId === selectedAttemptId)
      void attemptQuery.refetch();
    else if (attemptId && !stream) setSelectedAttemptId(attemptId);
    else start.mutate(assignmentId);
  };
  const expiredAttempt =
    lesson.assignments.find((a) => a.attempt_id === selectedAttemptId)
      ?.status === "interrupted";
  useEffect(() => {
    if (expiredAttempt && selectedAttemptId)
      void client.invalidateQueries({
        queryKey: trainingKeys.attempt(selectedAttemptId),
        exact: true,
      });
  }, [client, expiredAttempt, selectedAttemptId]);
  const incidents = lesson.assignments.flatMap((a) =>
    a.card ? [journalCard(a.card)] : [],
  );
  return {
    stream,
    begin: () => begin.mutate(),
    canBegin:
      lesson.status === "active" &&
      lesson.work_status !== "submitted" &&
      (stream || !!next),
    leave: exit.mutateAsync,
    leaving: exit.isPending,
    confirmStart,
    setConfirmStart,
    attempt,
    isDDS,
    next,
    proctoringFailed,
    remaining,
    unopened,
    refresh,
    openAttempt,
    incidents,
    opening:
      begin.isPending ||
      start.isPending ||
      (!!selectedAttemptId && attemptQuery.isFetching),
    openError: exit.error || begin.error || start.error || attemptQuery.error,
    closeAttempt: () => setSelectedAttemptId(null),
  };
}
