import { TrainingPanel } from "./TrainingPanel";
import { Telephone } from "@/features/telephone";
import { LearningHelp } from "@/features/learning-assistance";
import { attemptCard } from "@/features/incident-editing";
import { IncidentCardDialog } from "@/widgets/incident-card";
import { Alert } from "@mui/material";
import { useAttemptEditor } from "../model/useAttemptEditor";
import type { AttemptEditorProps } from "../types/TrainingWorkspacePage";
export function AttemptEditor(props: AttemptEditorProps) {
  const { onClose } = props;
  const {
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
    busy,
  } = useAttemptEditor(props);
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
        remote={remote}
        trainingNotice={
          <TrainingPanel
            condition={attempt.caller_message}
            instruction={attempt.instructions}
          >
            <Telephone attemptId={attempt.id} completed={completed} />
            <LearningHelp
              attempt={attempt}
              activity={activity}
              busy={busy}
              beforeRequest={beforeHint}
              onHighlight={setHighlight}
            />
          </TrainingPanel>
        }
      />
    </>
  );
}
