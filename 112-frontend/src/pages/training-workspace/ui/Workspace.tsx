import { LearningSummary, lessonKindLabels } from "@/entities/training";
import { useStudentWorkspace } from "../model/useStudentWorkspace";
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
import { Link } from "react-router-dom";
import { styles } from "../styles/Workspace";
import type { WorkspaceProps } from "../types/TrainingWorkspacePage";
import { AttemptEditor } from "./AttemptEditor";
import { DDSWorkspace } from "./DDSWorkspace";
export function Workspace({ lesson }: WorkspaceProps) {
  const {
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
    opening,
    openError,
    closeAttempt,
  } = useStudentWorkspace({ lesson });
  if (unopened)
    return (
      <Stack spacing={2} sx={styles.stack}>
        <h1>{lesson.title}</h1>
        <LearningSummary policy={lesson.learning} />
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
          disabled={!next || opening}
          onClick={() => setConfirmStart(true)}
        >
          Приступить к заданию
        </Button>
        {lesson.status === "planned" && (
          <p>Задание ещё не доступно. Оно откроется в указанное время.</p>
        )}
        {openError && (
          <Alert severity="error">{getApiError(openError).message}</Alert>
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
              disabled={opening}
              onClick={() => {
                if (next) {
                  openAttempt({ assignmentId: next.id, attemptId: null });
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
          {lesson.assignments.filter((a) => a.status === "completed").length} /{" "}
          {lesson.assignments.length}
        </span>
        {next && (
          <Button
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
      {proctoringFailed && (
        <Alert severity="warning">События прокторинга ожидают отправки.</Alert>
      )}
      <StudentMessages compact />
      {lesson.assignments.some((a) => a.role === "dds") && (
        <Alert severity="info">
          Работа своей службы не меняет статусы других служб. Учебный телефон доступен внутри карточки после настройки рабочего места.
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
      <IncidentFeed
        incidents={incidents}
        selectedId={attempt?.card.id}
        onOpen={(card) => {
          const row = lesson.assignments.find((a) => a.card?.id === card.id);
          if (row && !opening)
            openAttempt({ assignmentId: row.id, attemptId: row.attempt_id });
        }}
        toolbar={
          <div className="arm-journal-actions">
            <ArmIconButton
              icon="plus"
              label={
                isDDS ? "Получить следующую карточку" : "Создать новую карточку"
              }
              disabled={!next || !!next.attempt_id || opening}
              onClick={() => {
                if (next)
                  openAttempt({ assignmentId: next.id, attemptId: null });
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
