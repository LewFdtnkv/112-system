import { type IncidentCard } from "@/entities/incident-card";
import { type ReactNode } from "react";
export interface IncidentFeedProps {
  toolbar?: ReactNode;
  workflowStatus?: (incident: IncidentCard) => string;
  timing?: (incident: IncidentCard) => ReactNode;
  incidents: readonly IncidentCard[];
  selectedId?: string;
  onOpen: (incident: IncidentCard) => void;
}
