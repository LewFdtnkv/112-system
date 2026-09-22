export type TrainingStatus = "assigned" | "active" | "completed";

export interface DemoTrainingSession {
  id: string;
  scenarioId: string;
  studentId: string;
  teacherId: string;
  status: TrainingStatus;
  scheduledAt: string;
}

export interface DemoTrainingResult {
  sessionId: string;
  criteria: { name: string; score: number; maxScore: number }[];
  comment: string;
}
