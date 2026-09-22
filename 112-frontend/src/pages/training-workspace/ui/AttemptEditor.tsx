import type { IncidentCardFields } from "@/entities/incident-card";
import { trainingApi, type Attempt } from "@/entities/training";
import { attemptCard, cardData } from "@/features/incident-editing";
import { useAttemptAudit } from "@/features/operator-workspace";
import { getApiError } from "@/shared/api";
import type { FeatureValue } from "@/shared/lib/featureValues";
import { useDebounced } from "@/shared/lib/useDebounced";
import { IncidentCardDialog } from "@/widgets/incident-card";
import { Alert } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { AttemptEditorProps } from "../types/TrainingWorkspacePage";
export function AttemptEditor({
  initial,
  onClose,
  onSaved,
}: AttemptEditorProps) {
  const [attempt, setAttempt] = useState(initial);
  const observedFields = useRef(JSON.stringify(attemptCard(initial).fields));
  const revision = useRef(initial.card.revision);
  const pendingFields = useRef<IncidentCardFields | null>(null);
  const saving = useRef<Promise<Attempt>>(Promise.resolve(initial));
  const [autosaveError, setAutosaveError] = useState("");
  const [selected, setSelected] = useState(initial.classifier_entry);
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
  const persist = (fields: IncidentCardFields) => {
    const operation = saving.current
      .catch(() => attempt)
      .then(async () => {
        const updated = await trainingApi.saveDraft(
          attempt.id,
          revision.current,
          fields.categoryId || null,
          cardData(fields, initial.card.data),
          fields.manualServices?.map((s) => s.id) ?? null,
        );
        revision.current = updated.card.revision;
        setAttempt(updated);
        setAutosaveError("");
        return updated;
      });
    saving.current = operation;
    return operation;
  };
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
      void persistRef.current(fields).catch((error) => {
        setAutosaveError(getApiError(error).message);
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [completed]);
  const save = async (fields: IncidentCardFields) => {
    pendingFields.current = null;
    audit.observe(fields);
    await audit.flush();
    const updated = await persist(fields);
    onSaved();
    return updated;
  };
  const submit = async (fields: IncidentCardFields) => {
    const updated = await save(fields);
    const submitted = await trainingApi.submit(
      updated.id,
      updated.card.revision,
    );
    setAttempt(submitted);
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
  return (
    <>
      {autosaveError && (
        <Alert severity="error">Черновик не сохранён: {autosaveError}</Alert>
      )}
      {audit.failed && (
        <Alert severity="warning">
          Часть наблюдений за вводом пока не отправлена. Сохранение карточки и
          оповещение фиксируются сервером независимо от них.
        </Alert>
      )}
      <IncidentCardDialog
        card={attemptCard(attempt)}
        log={[]}
        isSubmitted={attempt.status === "completed"}
        readOnly={attempt.status === "interrupted"}
        readOnlyLayout={completed ? "form" : undefined}
        isCallAccepted={attempt.status === "in_progress" || completed}
        onClose={onClose}
        onCommitAction={() => {}}
        onSubmit={submit}
        elapsedSeconds={Math.max(
          0,
          Math.floor(
            ((attempt.ended_at ? Date.parse(attempt.ended_at) : now) -
              Date.parse(attempt.started_at)) /
              1000,
          ),
        )}
        normSeconds={attempt.norm_seconds}
        remote={{
          features:
            (selected?.conditions?.features as
              { key: string; label: string }[] | undefined) ?? [],
          onFieldsChange: (fields) => {
            const serialized = JSON.stringify(fields);
            if (!completed && serialized !== observedFields.current) {
              observedFields.current = serialized;
              pendingFields.current = fields;
            }
            audit.observe(fields);
            setAnswers((previous) =>
              JSON.stringify(previous) ===
              JSON.stringify(fields.ekpAnswers ?? {})
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
        }}
      />
    </>
  );
}
