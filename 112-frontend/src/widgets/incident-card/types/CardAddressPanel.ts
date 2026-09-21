import type { IncidentEditor } from "@/features/incident-editing";
export interface Props {
  editor: IncidentEditor;
  disabled: boolean;
  viewing: boolean;
  onMap: () => void;
}
