import type { IncidentCardEditor } from "./IncidentCardDialog";
export interface CardTrainingCommentProps {
  editor: IncidentCardEditor;
  disabled: boolean;
  viewing: boolean;
  locked: (skill: string) => boolean;
  log: readonly string[];
  onClose: () => void;
  onPreview: () => void;
}
