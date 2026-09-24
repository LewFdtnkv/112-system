import type { IncidentCardEditor } from "./IncidentCardDialog";
export interface CardFooterToolsProps {
  editor: IncidentCardEditor;
  viewing: boolean;
  disabled: boolean;
  commentOpen: boolean;
  onCommentToggle: () => void;
  onClose: () => void;
  onTiming: () => void;
}
