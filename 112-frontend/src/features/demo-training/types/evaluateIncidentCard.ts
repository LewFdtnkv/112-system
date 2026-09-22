import { type IncidentCardFields } from "@/entities/incident-card";
export interface EvaluateIncidentCardInput {
  sessionId: string;
  fields: IncidentCardFields;
  actionLog: readonly string[];
  elapsedSeconds: number;
  normSeconds: number;
}
