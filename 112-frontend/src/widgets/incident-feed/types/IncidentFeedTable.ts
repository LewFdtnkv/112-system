import type { IncidentCard } from "@/entities/incident-card";
import type { ReactNode } from "react";
export interface IncidentFeedTableProps {
  incidents: IncidentCard[];
  selectedId?: string;
  timing?: (incident: IncidentCard) => ReactNode;
  workflowStatus?: (incident: IncidentCard) => string;
  descending: boolean;
  hiddenDescriptions: string[];
  onOpen: (incident: IncidentCard) => void;
  onSortToggle: () => void;
  onDescriptionToggle: (id: string) => void;
}
