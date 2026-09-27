import { useAttemptCatalog } from "./useAttemptCatalog";
import type { IncidentCardFields } from "@/entities/incident-card";
import { attemptApi } from "@/entities/training";
import { attemptCard, type RemoteEditor } from "@/features/incident-editing";
import { useAttemptAudit } from "@/features/operator-workspace";
import { getApiError } from "@/shared/api";
import type { FeatureValue } from "@/shared/lib/featureValues";
import { useDebounced } from "@/shared/lib/useDebounced";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { AttemptEditorProps } from "../types/TrainingWorkspacePage";
import { useAttemptDraft } from "./useAttemptDraft";
import type { Attempt } from "@/entities/training";
export function useAttemptEditor(
  { initial, onSaved }: AttemptEditorProps,
  onReset: (value: Attempt) => void,
) {
  const writes = useAttemptDraft(initial, onReset);
  const { attempt } = writes;
  const lastActivityFields = useRef(JSON.stringify(writes.initialFields));
  const autosaveError = writes.draft.error
    ? getApiError(writes.draft.error).message
    : "";
  const [selectedId, setSelectedId] = useState(writes.initialFields.categoryId);
  const [activity, setActivity] = useState(0);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [answers, setAnswers] = useState<Record<string, FeatureValue>>(
    writes.initialFields.ekpAnswers ?? {},
  );
  const debouncedAnswers = useDebounced(answers);
  const [now, setNow] = useState(() => Date.now());
  const completed = attempt.status !== "in_progress";
  const audit = useAttemptAudit(
    attempt.id,
    attemptCard(initial).fields,
    !completed,
  );
  useEffect(() => {
    if (completed) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [completed]);
  useEffect(() => {
    if (completed) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [completed]);
  const { entries, matches, popular } = useAttemptCatalog(
    attempt.id,
    !completed,
    search,
  );
  const selected =
    entries.data?.find((entry) => entry.id === selectedId) ??
    (initial.classifier_entry?.id === selectedId
      ? initial.classifier_entry
      : null);
  const recipients = useQuery({
    queryKey: ["recipients", attempt.id, selected?.id, debouncedAnswers],
    queryFn: ({ signal }) =>
      ["boolean-features-v1", "typed-features-v1"].includes(
        String(selected?.conditions?.format),
      )
        ? attemptApi.previewRecipients(
            attempt.id,
            selected!.id,
            debouncedAnswers,
            signal,
          )
        : attemptApi.recipients(attempt.id, selected!.id, signal),
    enabled: !!selected && !completed,
  });
  const save = async (fields: IncidentCardFields) => {
    audit.observe(fields);
    await writes.save(fields);
    await audit.flush();
    onSaved();
  };
  const submit = async (fields: IncidentCardFields) => {
    await save(fields);
    await writes.submit.mutateAsync();
    onSaved();
  };
  const targets = completed
    ? attempt.notified_services
    : selected
      ? (recipients.data ?? [])
      : [];
  const error =
    entries.error ||
    (JSON.stringify(answers) === JSON.stringify(debouncedAnswers) &&
    !recipients.isFetching
      ? recipients.error
      : undefined);
  const remote: RemoteEditor = {
    editableSkills: attempt.exercise_scope,
    highlightTarget: highlight,
    features:
      (selected?.conditions?.features as
        { key: string; label: string }[] | undefined) ?? [],
    onFieldsChange: (fields) => {
      if (!completed && JSON.stringify(fields) !== lastActivityFields.current) {
        lastActivityFields.current = JSON.stringify(fields);
        setActivity(Date.now());
      }
      writes.observe(fields);
      audit.observe(fields);
      setAnswers((previous) =>
        JSON.stringify(previous) === JSON.stringify(fields.ekpAnswers ?? {})
          ? previous
          : (fields.ekpAnswers ?? {}),
      );
    },
    categories: matches.map((e) => ({
      id: e.id,
      name: e.display_name || e.name,
    })),
    popularCategories: popular.map((e) => ({
      id: e.id,
      name: e.display_name || e.name,
    })),
    categoryName: selected ? selected.display_name || selected.name : "",
    notificationRequired: selected?.notification_required !== false,
    serviceQueryKey: attempt.id,
    loadServices: async (q, offset, signal) => {
      const page = await attemptApi.services(attempt.id, { q, offset }, signal);
      return {
        items: page.items.map((s) => ({
          id: s.id,
          name: s.name,
          short_name: s.short_name,
        })),
        total: page.total,
      };
    },
    services: targets.map((s) => ({
      id: s.service_id,
      name: s.name,
      short_name: s.short_name,
    })),
    search: setSearch,
    select: setSelectedId,
    onSave: async (fields) => {
      await save(fields);
    },
    searching: entries.isFetching,
    error: error ? getApiError(error).message : undefined,
  };
  const beforeHint = writes.flush;
  return {
    localDraft: writes,
    editorCard: { ...attemptCard(attempt), fields: writes.initialFields },
    attempt,
    autosaveError,
    audit,
    completed,
    submit,
    now,
    remote,
    activity,
    setHighlight,
    beforeHint,
    busy: writes.draft.isPending || writes.submit.isPending,
  };
}
