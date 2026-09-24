import { JournalGuide } from "@/features/learning-assistance";
import { LearningSummary } from "@/entities/training";
import { StudentMessages } from "@/features/teaching-messages";
import { getApiError } from "@/shared/api";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
} from "@mui/material";
import { styles } from "../styles/Workspace";
import type { WorkspaceStageProps } from "../types/TrainingWorkspacePage";

export function WorkspaceStartScreen({
  lesson,
  workspace,
}: WorkspaceStageProps) {
  const {
    stream,
    begin,
    canBegin,
    confirmStart,
    setConfirmStart,
    next,
    opening,
    openError,
    openAttempt,
  } = workspace;
  return (
    <Stack spacing={2} sx={styles.stack}>
      <h1>{lesson.title}</h1>
      {lesson.learning.kind === "introduction" && canBegin && !confirmStart && (
        <JournalGuide mode="start" />
      )}
      <LearningSummary policy={lesson.learning} />
      <p>
        Карточек: {lesson.assignments.length}.{" "}
        {stream
          ? "Карточки поступают по расписанию после начала занятия, даже пока вы обрабатываете предыдущую. Норматив реакции каждой карточки начинается с её поступления."
          : "Выполняйте их последовательно. Срок задания общий; лимит карточки начинается при её открытии."}
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
        Во время выполнения сохраняются события видимости вкладки и фокуса окна
        для проверки преподавателем. Камера и экран не записываются. Учебные
        действия ведутся в отдельном журнале для оценивания и подсказок.
      </Alert>
      <Alert severity="warning">
        По истечении срока работа фиксируется. Непройденные карточки учитываются
        как 0.
      </Alert>
      <Button
        variant="contained"
        data-learning-target="journal.start"
        disabled={!canBegin || opening}
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
            {stream
              ? "Начнётся расписание поступления карточек. "
              : "Таймер первой карточки начнётся сразу. "}
            Закрытие страницы не останавливает время.
          </p>
          <Button
            disabled={opening}
            onClick={() => {
              if (stream) {
                begin();
                setConfirmStart(false);
              } else if (next) {
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
}
