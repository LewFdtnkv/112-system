import type { IncidentCardEditor } from "./IncidentCardDialog";
export interface CardClassificationViewProps {
  editor: IncidentCardEditor;
  categoryName: string;
  hasVictims: boolean;
}
