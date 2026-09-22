import type { IncidentCardFields } from "@/entities/incident-card";
import { trainingApi } from "@/entities/training";
import { attemptCard, type RemoteEditor } from "@/features/incident-editing";
import { useAttemptAudit } from "@/features/operator-workspace";
import { getApiError } from "@/shared/api";
import type { FeatureValue } from "@/shared/lib/featureValues";
import { useDebounced } from "@/shared/lib/useDebounced";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { AttemptEditorProps } from "../types/TrainingWorkspacePage";
import { useAttemptWrites } from "./useAttemptWrites";
export function useAttemptEditor({ initial, onSaved }: AttemptEditorProps) {
  const writes = useAttemptWrites(initial);
  const { attempt } = writes;
  const observedFields = useRef(JSON.stringify(attemptCard(initial).fields));
  const pendingFields = useRef<IncidentCardFields | null>(null);
  const autosaveError = writes.draft.error
    ? getApiError(writes.draft.error).message
    : "";
  const [selected, setSelected] = useState(initial.classifier_entry);
  const [activity, setActivity] = useState(0);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search.trim());
  const [answers, setAnswers] = useState<Record<string, FeatureValue>>(
    (initial.card.data.features?.ekp as Record<string, FeatureValue>) ?? {},
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
  const entries = useQuery({
    queryKey: ["attempt-entries", attempt.id, debounced],
    queryFn: ({ signal }) =>
      trainingApi.attemptEntries(attempt.id, { q: debounced }, signal),
    enabled: !completed && debounced.length >= 2 && search.trim().length >= 2,
  });
  const popular = useQuery({
    queryKey: ["attempt-popular-entries", attempt.id],
    queryFn: ({ signal }) =>
      trainingApi.attemptEntries(
        attempt.id,
        { popular: true, limit: 11 },
        signal,
      ),
    enabled: !completed,
    staleTime: Infinity,
  });
  const recipients = useQuery({
    queryKey: ["recipients", attempt.id, selected?.id, debouncedAnswers],
    queryFn: ({ signal }) =>
      ["boolean-features-v1", "typed-features-v1"].includes(
        String(selected?.conditions?.format),
      )
        ? trainingApi.previewRecipients(
            attempt.id,
            selected!.id,
            debouncedAnswers,
            signal,
          )
        : trainingApi.recipients(attempt.id, selected!.id, signal),
    enabled: !!selected && !completed,
  });
  const persist = writes.draft.mutateAsync;
  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  });
  useEffect(() => {
    if (completed) return;
    const timer = window.setInterval(() => {
      const fields = pendingFields.current;
      if (!fields) return;
      pendingFields.current = null;
      void persistRef.current(fields).catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [completed]);
  const save = async (fields: IncidentCardFields) => {
    pendingFields.current = null;
    audit.observe(fields);
    const updated = await persist(fields);
    await audit.flush();
    onSaved();
    return updated;
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
    popular.error ||
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
      const serialized = JSON.stringify(fields);
      if (!completed && serialized !== observedFields.current) {
        observedFields.current = serialized;
        setActivity(Date.now());
        pendingFields.current = fields;
      }
      audit.observe(fields);
      setAnswers((previous) =>
        JSON.stringify(previous) === JSON.stringify(fields.ekpAnswers ?? {})
          ? previous
          : (fields.ekpAnswers ?? {}),
      );
    },
    categories: (debounced === search.trim() && debounced.length >= 2
      ? (entries.data ?? [])
      : []
    ).map((e) => ({
      id: e.id,
      name: e.display_name || e.name,
    })),
    popularCategories: (popular.data ?? []).map((e) => ({
      id: e.id,
      name: e.display_name || e.name,
    })),
    categoryName: selected ? selected.display_name || selected.name : "",
    notificationRequired: selected?.notification_required !== false,
    serviceQueryKey: attempt.id,
    loadServices: async (q, offset, signal) => {
      const page = await trainingApi.attemptServices(
        attempt.id,
        { q, offset },
        signal,
      );
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
    select: (id) =>
      setSelected(
        [...(entries.data ?? []), ...(popular.data ?? [])].find(
          (e) => e.id === id,
        ) ?? null,
      ),
    onSave: async (fields) => {
      await save(fields);
    },
    message: [attempt.caller_message, attempt.instructions]
      .filter(Boolean)
      .join("\n\n"),
    searching:
      entries.isFetching ||
      popular.isFetching ||
      (search.trim().length >= 2 && debounced !== search.trim()),
    error: error ? getApiError(error).message : undefined,
  };
  const beforeHint = async () => {
    const fields = pendingFields.current;
    if (fields) {
      pendingFields.current = null;
      try {
        await persist(fields);
      } catch (error) {
        pendingFields.current ??= fields;
        throw error;
      }
    } else if (writes.draft.error) {
      throw new Error(
        "Сначала сохраните черновик: предыдущая запись не удалась.",
      );
    }
  };
  return {
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
