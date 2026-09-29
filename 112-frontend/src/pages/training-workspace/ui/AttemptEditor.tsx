import { cardElapsedSeconds } from "@/entities/training";
import { LeaveLessonButton } from "./LeaveLessonButton";
import { TrainingPanel } from "./TrainingPanel";
import { Telephone } from "@/features/telephone";
import { LearningHelp } from "@/features/learning-assistance";
import { IncidentCardDialog } from "@/widgets/incident-card";
import { Alert } from "@mui/material";
import { useAttemptEditor } from "../model/useAttemptEditor";
import { useState } from "react";
import { AttemptDraftNotice } from "./AttemptDraftNotice";
import type { AttemptEditorProps } from "../types/TrainingWorkspacePage";
import type {
  AttemptEditorContentProps,
  AttemptReplacement,
} from "../types/AttemptDraft";
export function AttemptEditor(props: AttemptEditorProps) {
  const [replacement, setReplacement] = useState<AttemptReplacement | null>(
    null,
  );
  return (
    <AttemptEditorContent
      key={replacement?.epoch ?? 0}
      {...props}
      initial={replacement?.attempt ?? props.initial}
      onReset={(attempt) =>
        setReplacement((previous) => ({
          attempt,
          epoch: (previous?.epoch ?? 0) + 1,
        }))
      }
    />
  );
}

function AttemptEditorContent(props: AttemptEditorContentProps) {
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
    localDraft,
    editorCard,
  } = useAttemptEditor(props, props.onReset);
  return (
    <>
      {audit.failed && (
        <Alert severity="warning">
          Не удалось передать часть истории ввода. Вы можете продолжать
          заполнять карточку, сохранять её и оповещать службы.
        </Alert>
      )}
      <IncidentCardDialog
        card={editorCard}
        log={[]}
        isSubmitted={attempt.status === "completed"}
        readOnly={attempt.status === "interrupted"}
        readOnlyLayout={completed ? "form" : undefined}
        isCallAccepted={attempt.status === "in_progress" || completed}
        onClose={() => {
          void beforeHint()
            .then(onClose)
            .catch(() => undefined);
        }}
        onSubmit={submit}
        elapsedSeconds={cardElapsedSeconds(
          attempt,
          attempt.ended_at ? Date.parse(attempt.ended_at) : now,
        )}
        normSeconds={attempt.norm_seconds}
        remote={remote}
        trainingNotice={
          <TrainingPanel
            condition={attempt.caller_message}
            instruction={attempt.instructions}
          >
            <AttemptDraftNotice draft={localDraft} error={autosaveError} />
            <LeaveLessonButton beforeLeave={beforeHint} disabled={busy} />
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
