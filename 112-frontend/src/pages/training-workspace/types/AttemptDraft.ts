import type { useAttemptDraft } from "../model/useAttemptDraft";
import type { Attempt } from "@/entities/training";
import type { AttemptEditorProps } from "./TrainingWorkspacePage";

export interface AttemptReplacement {
  attempt: Attempt;
  epoch: number;
}

export type AttemptEditorContentProps = AttemptEditorProps & {
  onReset: (value: Attempt) => void;
};

export interface AttemptDraftNoticeProps {
  draft: ReturnType<typeof useAttemptDraft>;
  error: string;
}
