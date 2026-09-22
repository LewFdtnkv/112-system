import {
  trainingApi,
  trainingKeys,
  attemptQueryOptions,
} from "@/entities/training";
import { journalCard } from "@/features/incident-editing";
import { useProctoring } from "@/features/proctoring";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type {
  WorkspaceProps,
  OpenAttempt,
} from "../types/TrainingWorkspacePage";

export function useStudentWorkspace({ lesson }: WorkspaceProps) {
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
  const isDDS = lesson.assignments.some((a) => a.role === "dds");
  const next = lesson.assignments.find((a) => a.available);
  const activeAttempt = lesson.assignments.find(
    (a) => a.status === "in_progress",
  );
  const proctoringFailed = useProctoring(
    activeAttempt?.attempt_id ?? undefined,
    !!activeAttempt,
  );
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const deadline = Math.min(
    lesson.available_until ? Date.parse(lesson.available_until) : Infinity,
    activeAttempt?.deadline_at
      ? Date.parse(activeAttempt.deadline_at)
      : Infinity,
  );
  const remaining = Number.isFinite(deadline)
    ? Math.max(0, Math.ceil((deadline - now) / 1000))
    : null;
  const unopened =
    !lesson.assignments.some((a) => a.attempt_id) &&
    lesson.work_status !== "submitted";

  const refresh = () => {
    void client.invalidateQueries({
      queryKey: trainingKeys.studentLesson(lesson.id),
    });
    void client.invalidateQueries({ queryKey: trainingKeys.lessons });
  };
  const start = useMutation({
    mutationFn: trainingApi.startAttempt,
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
    else if (attemptId) setSelectedAttemptId(attemptId);
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
      start.isPending || (!!selectedAttemptId && attemptQuery.isFetching),
    openError: start.error || attemptQuery.error,
    closeAttempt: () => setSelectedAttemptId(null),
  };
}
