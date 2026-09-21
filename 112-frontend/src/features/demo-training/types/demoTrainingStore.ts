import type { IncidentCardFields } from "@/entities/incident-card";
import { type DemoTrainingSession } from "@/entities/training-session";
import { type Evaluation } from "../model/evaluationIndex";
export interface CompleteTrainingInput {
  sessionId: string;
  fields: IncidentCardFields;
  actionLog: readonly string[];
  elapsedSeconds: number;
  normSeconds: number;
}

export interface DemoTrainingState {
  sessions: readonly DemoTrainingSession[];
  evaluations: readonly Evaluation[];
  startSession: (sessionId: string) => void;
  completeSession: (input: CompleteTrainingInput) => Evaluation | null;
  reset: () => void;
}
