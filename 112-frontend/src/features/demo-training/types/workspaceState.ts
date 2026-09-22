import type { IncidentCard } from "@/entities/incident-card";
export type PersistedCallState = "incoming" | "accepted" | "declined";

export type PersistedConnectionState = "connected" | "reconnecting";

export interface WorkspaceSnapshot {
  incidents: readonly IncidentCard[];
  logs: Record<string, readonly string[]>;
  submittedIds: readonly string[];
  callState: PersistedCallState;
  connectionState: PersistedConnectionState;
  elapsedSeconds: number;
}
