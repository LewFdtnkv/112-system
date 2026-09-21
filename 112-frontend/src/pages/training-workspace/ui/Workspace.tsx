import { trainingApi, type Attempt } from "@/entities/training";
import { journalCard } from "@/features/incident-editing";
import { useProctoring } from "@/features/proctoring";
import { StudentMessages } from "@/features/teaching-messages";
import { getApiError } from "@/shared/api";
import { getTrainingResultPath, routePaths } from "@/shared/config/routes";
import { ArmIconButton } from "@/shared/ui/arm";
import { IncidentFeed } from "@/widgets/incident-feed";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { styles } from "../styles/Workspace";
import type { WorkspaceProps } from "../types/TrainingWorkspacePage";
import { AttemptEditor } from "./AttemptEditor";
import { DDSWorkspace } from "./DDSWorkspace";
export function Workspace({ lesson }: WorkspaceProps) {
  const [confirmStart, setConfirmStart] = useState(false);
  const [now, setNow] = useState(Date.now);
  const client = useQueryClient();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
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
  const openedAttemptId = attempt?.id;
  const expiredAttempt =
    attempt &&
    lesson.assignments.find((a) => a.attempt_id === attempt.id)?.status ===
      "interrupted";
  useEffect(() => {
    if (!expiredAttempt || !openedAttemptId) return;
    let cancelled = false;
    void trainingApi.attempt(openedAttemptId).then((data) => {
      if (!cancelled) setAttempt(data);
    });
    return () => {
      cancelled = true;
    };
  }, [expiredAttempt, openedAttemptId]);
  const incidents = lesson.assignments.flatMap((a) =>
    a.card ? [journalCard(a.card)] : [],
  );
  if (unopened)
    return (
      <Stack spacing={2} sx={styles.stack}>
        <h1>{lesson.title}</h1>
        <p>
          Карточек: {lesson.assignments.length}. Выполняйте их последовательно.
          Срок задания общий; лимит карточки начинается при её открытии.
        </p>
        <p>
          Начало:{" "}
          {lesson.available_from
            ? new Date(lesson.available_from).toLocaleString("ru-RU")
            : "Сразу"}
          . Окончание:{" "}
          {lesson.available_until
            ? new Date(lesson.available_until).toLocaleString("ru-RU")
            : "Без общей даты окончания"}
          .
        </p>
        <Alert severity="info">
          Во время выполнения сохраняются события видимости вкладки и фокуса
          окна для проверки преподавателем. Камера и экран не записываются.
          Учебные действия ведутся в отдельном журнале для оценивания и
          подсказок.
        </Alert>
        <Alert severity="warning">
          По истечении срока работа фиксируется. Непройденные карточки
          учитываются как 0.
        </Alert>
        <Button
          variant="contained"
          disabled={!next || open.isPending}
          onClick={() => setConfirmStart(true)}
        >
          Приступить к заданию
        </Button>
        {lesson.status === "planned" && (
          <p>Задание ещё не доступно. Оно откроется в указанное время.</p>
        )}
        {open.error && (
          <Alert severity="error">{getApiError(open.error).message}</Alert>
        )}
        <StudentMessages />
        <Dialog open={confirmStart} onClose={() => setConfirmStart(false)}>
          <DialogTitle>Начать выполнение?</DialogTitle>
          <DialogContent>
            <p>
              Таймер первой карточки начнётся сразу. Закрытие страницы не
              останавливает время.
            </p>
            <Button
              disabled={open.isPending}
              onClick={() => {
                if (next) {
                  open.mutate({ assignmentId: next.id, attemptId: null });
                  setConfirmStart(false);
                }
              }}
            >
              Подтвердить начало
            </Button>
            <Button onClick={() => setConfirmStart(false)}>Отмена</Button>
          </DialogContent>
        </Dialog>
      </Stack>
    );
  return (
    <div className="incident-desk">
      <div className="operator-training-bar">
        <strong>{lesson.title}</strong>
        {remaining !== null && lesson.work_status !== "submitted" && (
          <strong role="timer">
            Осталось: {Math.floor(remaining / 60)}:
            {String(remaining % 60).padStart(2, "0")}
          </strong>
        )}
        <span>
          {isDDS ? "Диспетчер ДДС" : "Оператор 112"} · Карточек сдано:{" "}
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
              ? isDDS
                ? "Продолжить обработку"
                : "Продолжить заполнение"
              : "Начать следующую карточку"}
          </Button>
        )}
      </div>
      {proctoringFailed && (
        <Alert severity="warning">События прокторинга ожидают отправки.</Alert>
      )}
      <StudentMessages compact />
      {lesson.assignments.some((a) => a.role === "dds") && (
        <Alert severity="info">
          Работа своей службы не меняет статусы других служб. Звонки пока не
          подключены.
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
          Задание завершено. Автоматическая оценка доступна в результатах.
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
              label={
                isDDS ? "Получить следующую карточку" : "Создать новую карточку"
              }
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
      {attempt?.dds ? (
        <DDSWorkspace
          key={`${attempt.id}:${attempt.status}`}
          initial={attempt}
          onClose={() => setAttempt(null)}
          onSaved={refresh}
        />
      ) : (
        attempt && (
          <AttemptEditor
            key={`${attempt.id}:${attempt.status}`}
            initial={attempt}
            onClose={() => setAttempt(null)}
            onSaved={refresh}
          />
        )
      )}
    </div>
  );
}
