import { Alert, Button } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { IncidentCardFields } from "@/entities/incident-card";
import {
  trainingApi,
  type Attempt,
  type StudentLesson,
} from "@/entities/training";
import {
  attemptCard,
  cardData,
  journalCard,
} from "@/features/operator-workspace";
import { getApiError } from "@/shared/api";
import { getTrainingResultPath, routePaths } from "@/shared/config/routes";
import { useDebounced } from "@/shared/lib/useDebounced";
import { ArmIconButton } from "@/shared/ui/arm";
import { QueryState } from "@/shared/ui/QueryState";
import { IncidentCardDialog } from "@/widgets/incident-card";
import { IncidentFeed } from "@/widgets/incident-feed";
export const TrainingWorkspacePage = () => {
  const { sessionId } = useParams();
  const lesson = useQuery({
    queryKey: ["student-lesson", sessionId],
    queryFn: ({ signal }) => trainingApi.studentLesson(sessionId!, signal),
  });
  return (
    <QueryState
      pending={lesson.isPending}
      error={lesson.error}
      retry={() => void lesson.refetch()}
    >
      {lesson.data && <Workspace key={lesson.data.id} lesson={lesson.data} />}
    </QueryState>
  );
};
function Workspace({ lesson }: { lesson: StudentLesson }) {
  const client = useQueryClient();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const next = lesson.assignments.find((a) => a.available);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["student-lesson", lesson.id] });
    void client.invalidateQueries({ queryKey: ["lessons"] });
  };
  const open = useMutation({
    mutationFn: ({
      assignmentId,
      attemptId,
    }: {
      assignmentId: string;
      attemptId: string | null;
    }) =>
      attemptId
        ? trainingApi.attempt(attemptId)
        : trainingApi.startAttempt(assignmentId),
    onSuccess: (data) => {
      setAttempt(data);
      refresh();
    },
  });
  const incidents = lesson.assignments.flatMap((a) =>
    a.card ? [journalCard(a.card)] : [],
  );
  return (
    <div className="incident-desk">
      <div className="operator-training-bar">
        <strong>{lesson.title}</strong>
        <span>
          Оператор 112 · Карточек сдано:{" "}
          {lesson.assignments.filter((a) => a.status === "completed").length} /{" "}
          {lesson.assignments.length}
        </span>
        {next && (
          <Button
            disabled={open.isPending}
            onClick={() =>
              open.mutate({ assignmentId: next.id, attemptId: next.attempt_id })
            }
          >
            {next.attempt_id
              ? "Продолжить заполнение"
              : "Начать следующую карточку"}
          </Button>
        )}
      </div>
      {lesson.assignments.some((a) => a.role === "dds") && (
        <Alert severity="info">
          Выполнение упражнения ДДС и SIP-звонки пока недоступны.
        </Alert>
      )}
      {lesson.status === "cancelled" && (
        <Alert severity="warning">Занятие отменено преподавателем.</Alert>
      )}
      {open.error && (
        <Alert severity="error">{getApiError(open.error).message}</Alert>
      )}
      {lesson.work_status === "submitted" && (
        <Alert
          severity="success"
          action={
            <Button component={Link} to={getTrainingResultPath(lesson.id)}>
              Результат
            </Button>
          }
        >
          Все карточки отправлены на проверку.
        </Alert>
      )}
      <IncidentFeed
        incidents={incidents}
        selectedId={attempt?.card.id}
        onOpen={(card) => {
          const row = lesson.assignments.find((a) => a.card?.id === card.id);
          if (row && !open.isPending)
            open.mutate({ assignmentId: row.id, attemptId: row.attempt_id });
        }}
        toolbar={
          <div className="arm-journal-actions">
            <ArmIconButton
              icon="plus"
              label="Создать новую карточку"
              disabled={!next || !!next.attempt_id || open.isPending}
              onClick={() => {
                if (next)
                  open.mutate({ assignmentId: next.id, attemptId: null });
              }}
            />
            <Link to={routePaths.studentDashboard}>Мои занятия</Link>
            <Button onClick={refresh}>Обновить журнал</Button>
          </div>
        }
      />
      {attempt && (
        <AttemptEditor
          key={attempt.id}
          initial={attempt}
          onClose={() => setAttempt(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
function AttemptEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: Attempt;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [attempt, setAttempt] = useState(initial);
  const [selected, setSelected] = useState(initial.classifier_entry);
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const [now, setNow] = useState(() => Date.now());
  const completed = attempt.status === "completed";
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
    enabled: !completed,
  });
  const recipients = useQuery({
    queryKey: ["recipients", attempt.id, selected?.id],
    queryFn: ({ signal }) =>
      trainingApi.recipients(attempt.id, selected!.id, signal),
    enabled: !!selected && !completed,
  });
  const save = async (fields: IncidentCardFields) => {
    const updated = await trainingApi.saveDraft(
      attempt.id,
      attempt.card.revision,
      fields.categoryId || null,
      cardData(fields, attempt.card.data),
    );
    setAttempt(updated);
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
  const error = entries.error || recipients.error;
  return (
    <>
      <IncidentCardDialog
        card={attemptCard(attempt)}
        log={[]}
        isSubmitted={completed}
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
          categories: (entries.data ?? []).map((e) => ({
            id: e.id,
            name: `${e.code} — ${e.name}`,
          })),
          categoryName: selected ? `${selected.code} — ${selected.name}` : "",
          services: targets.map((s) => ({ id: s.service_id, name: s.name })),
          search: setSearch,
          select: (id) =>
            setSelected(entries.data?.find((e) => e.id === id) ?? null),
          onSave: async (fields) => {
            await save(fields);
          },
          message: [attempt.caller_message, attempt.instructions]
            .filter(Boolean)
            .join("\n\n"),
          searching: entries.isFetching || recipients.isFetching,
          error: error ? getApiError(error).message : undefined,
        }}
      />
    </>
  );
}
