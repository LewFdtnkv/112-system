import type { HintRead } from "@/entities/training";
import { attemptApi, learningHelpApi } from "@/entities/training";
import { randomUUID } from "@/shared/lib/uuid";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { LearningHelpProps } from "../types";

export function useLearningHelp({
  attempt,
  beforeRequest,
  busy,
  activity = 0,
  onHighlight,
}: LearningHelpProps) {
  const policy = attempt.learning.assistance;
  const enabled =
    attempt.status === "in_progress" &&
    attempt.learning.kind !== "assessment" &&
    policy.max_level !== "none";
  const revision = attempt.dds?.revision ?? attempt.card.revision;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [shown, setShown] = useState<{
    response: HintRead;
    activity: number;
  } | null>(null);
  const current = useRef({ activity, revision, busy });
  useEffect(() => {
    current.current = { activity, revision, busy };
  }, [activity, revision, busy]);
  const request = useMutation({
    mutationKey: ["learning-hint", attempt.id],
    scope: { id: `hint:${attempt.id}` },
    retry: false,
    onSuccess: (value) => {
      if (value.response.status === "ready") {
        setShown(value);
        setDismissed(null);
      }
    },
    mutationFn: async ({
      trigger,
      level,
    }: {
      trigger: "request" | "automatic";
      level: "goal" | "explanation" | "solution";
    }) => {
      const before = current.current.activity;
      await beforeRequest?.();
      const response = await learningHelpApi.hint(attempt.id, {
        request_id: randomUUID(),
        trigger,
        level,
      });
      return { response, activity: before };
    },
  });
  const response = shown?.response;
  const hint =
    enabled &&
    !busy &&
    shown?.activity === activity &&
    response?.revision === revision &&
    response.hint?.id !== dismissed
      ? response?.hint
      : null;
  const highlight = hint?.presentation === "highlight" ? hint.target : null;
  const seen = useRef(new Set<string>());
  const hintId = hint?.id;
  useEffect(() => {
    if (!hintId || seen.current.has(hintId)) return;
    seen.current.add(hintId);
    const event = {
      command_id: randomUUID(),
      kind: "ui.hint_seen" as const,
      client_occurred_at: new Date().toISOString(),
      value: hintId,
    };
    void attemptApi.observations(attempt.id, [event]).catch(() => {
      // A display observation is optional; the authoritative issued hint is already persisted.
      seen.current.delete(hintId);
    });
  }, [attempt.id, hintId]);
  useEffect(() => {
    onHighlight(highlight ?? null);
    return () => onHighlight(null);
  }, [highlight, onHighlight]);
  const { mutate, isPending } = request;
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      if (
        document.visibilityState !== "visible" ||
        current.current.busy ||
        isPending ||
        Date.now() - current.current.activity < 15000
      )
        return;
      mutate({ trigger: "automatic", level: "goal" });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [enabled, mutate, isPending]);
  const levels = ["goal", "explanation", "solution"] as const;
  const next = hint ? levels[levels.indexOf(hint.level) + 1] : undefined;
  const canDeepen =
    policy.on_request &&
    next &&
    levels.indexOf(next) <=
      levels.indexOf(policy.max_level as (typeof levels)[number]);
  return {
    enabled,
    hint,
    request,
    next: canDeepen ? next : undefined,
    dismiss: () => setDismissed(hint?.id ?? null),
  };
}
