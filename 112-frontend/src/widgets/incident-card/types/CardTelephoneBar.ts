import type { IncidentCard } from "@/entities/incident-card";
import type { IncidentEditor } from "@/features/incident-editing";
export interface Props {
  card: IncidentCard;
  editor: IncidentEditor;
  disabled: boolean;
  accepted: boolean;
  elapsedSeconds: number;
  normSeconds: number;
  viewing: boolean;
  submitted: boolean;
  onViewChange: () => void;
  onHistory: (kind: "calls" | "sms") => void;
}
