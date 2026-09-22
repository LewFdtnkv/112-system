import type { IncidentEditor } from "@/features/incident-editing";

export interface IncidentCardContextValue {
  editor: IncidentEditor;
  disabled: boolean;
}
