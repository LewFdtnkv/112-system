import { type IncidentCard } from "@/entities/incident-card";
import { type ReactNode } from "react";
export interface IncidentFeedProps {
  toolbar?: ReactNode;
  incidents: readonly IncidentCard[];
  selectedId?: string;
  onOpen: (incident: IncidentCard) => void;
}
