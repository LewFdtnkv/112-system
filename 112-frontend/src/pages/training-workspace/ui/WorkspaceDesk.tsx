import { JournalGuide } from "@/features/learning-assistance";
import { lessonKindLabels } from "@/entities/training";
import { StudentMessages } from "@/features/teaching-messages";
import { getApiError } from "@/shared/api";
import { getTrainingResultPath } from "@/shared/config/routes";
import { ArmIconButton } from "@/shared/ui/arm";
import { IncidentFeed } from "@/widgets/incident-feed";
import { Alert, Button } from "@mui/material";
import { Link } from "react-router-dom";
import type { WorkspaceStageProps } from "../types/TrainingWorkspacePage";
import { AttemptEditor } from "./AttemptEditor";
import { DDSArrivalStatus } from "./DDSArrivalStatus";
import { DDSReactionTime } from "./DDSReactionTime";
import { DDSWorkspace } from "./DDSWorkspace";

export function WorkspaceDesk({ lesson, workspace }: WorkspaceStageProps) {
  const {
    stream,
    attempt,
    isDDS,
    next,
    proctoringFailed,
    remaining,
    refresh,
    incidents,
    opening,
    openError,
    openAttempt,
    closeAttempt,
  } = workspace;
  const completed = lesson.assignments.filter(
    (assignment) => assignment.status === "completed",
  ).length;
  return (
    <div className="incident-desk">
      {lesson.learning.kind === "introduction" &&
        !attempt &&
        lesson.status === "active" &&
        (next || (stream && lesson.work_status !== "submitted")) && (
          <JournalGuide
            mode={next ? (next.attempt_id ? "resume" : "new") : "waiting"}
          />
        )}
      <div className="operator-training-bar">
        <strong>
          {lesson.title} · {lessonKindLabels[lesson.learning.kind]}
        </strong>
        {remaining !== null && lesson.work_status !== "submitted" && (
          <strong role="timer">
            Осталось: {Math.floor(remaining / 60)}:
            {String(remaining % 60).padStart(2, "0")}
          </strong>
        )}
        <span>
          {isDDS ? "Диспетчер ДДС" : "Оператор 112"} · Карточек сдано:{" "}
          {completed} / {lesson.assignments.length}
        </span>
        {next && (
          <Button
            data-learning-target="journal.resume"
            disabled={opening}
            onClick={() =>
              openAttempt({ assignmentId: next.id, attemptId: next.attempt_id })
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
      {stream && <DDSArrivalStatus lesson={lesson} />}
      {proctoringFailed && (
        <Alert severity="warning">События прокторинга ожидают отправки.</Alert>
      )}
      <StudentMessages compact />
      {lesson.assignments.some((assignment) => assignment.role === "dds") && (
        <Alert severity="info">
          Работа своей службы не меняет статусы других служб. Учебный телефон
          доступен внутри карточки после настройки рабочего места.
        </Alert>
      )}
      {lesson.status === "cancelled" && (
        <Alert severity="warning">Занятие отменено преподавателем.</Alert>
      )}
      {openError && (
        <Alert severity="error">{getApiError(openError).message}</Alert>
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
      <div data-learning-target="journal.waiting">
        <IncidentFeed
          incidents={incidents}
          workflowStatus={
            stream
              ? (card) => {
                  const assignment = lesson.assignments.find(
                    (row) => row.card?.id === card.id,
                  );
                  return assignment?.status === "completed"
                    ? "Завершена"
                    : assignment?.status === "interrupted"
                      ? "Время истекло"
                      : assignment?.first_opened_at
                        ? "В работе"
                        : "Ожидает открытия";
                }
              : undefined
          }
          timing={
            stream
              ? (card) => {
                  const assignment = lesson.assignments.find(
                    (row) => row.card?.id === card.id,
                  );
                  return assignment ? (
                    <DDSReactionTime assignment={assignment} />
                  ) : null;
                }
              : undefined
          }
          selectedId={attempt?.card.id}
          onOpen={(card) => {
            const assignment = lesson.assignments.find(
              (row) => row.card?.id === card.id,
            );
            if (assignment && !opening)
              openAttempt({
                assignmentId: assignment.id,
                attemptId: assignment.attempt_id,
              });
          }}
          toolbar={
            <div className="arm-journal-actions">
              {!stream && (
                <ArmIconButton
                  icon="plus"
                  data-learning-target="journal.new"
                  label={
                    isDDS
                      ? "Получить следующую карточку"
                      : "Создать новую карточку"
                  }
                  disabled={!next || !!next.attempt_id || opening}
                  onClick={() => {
                    if (next)
                      openAttempt({ assignmentId: next.id, attemptId: null });
                  }}
                />
              )}
              <Button
                disabled={workspace.leaving}
                onClick={() => void workspace.leave().catch(() => undefined)}
              >
                Выйти из занятия
              </Button>
              <Button onClick={refresh}>Обновить журнал</Button>
            </div>
          }
        />
      </div>
      {attempt?.dds ? (
        <DDSWorkspace
          key={`${attempt.id}:${attempt.status}`}
          initial={attempt}
          lesson={lesson}
          onClose={closeAttempt}
          onSaved={refresh}
        />
      ) : (
        attempt && (
          <AttemptEditor
            key={`${attempt.id}:${attempt.status}`}
            initial={attempt}
            onClose={closeAttempt}
            onSaved={refresh}
          />
        )
      )}
    </div>
  );
}
