import type { IncidentCard } from "@/entities/incident-card";
export interface Props {
  card: IncidentCard;
  elapsedSeconds: number;
  normSeconds: number;
  viewing: boolean;
  submitted: boolean;
  onViewChange: () => void;
  onHistory: (kind: "calls" | "sms") => void;
}
