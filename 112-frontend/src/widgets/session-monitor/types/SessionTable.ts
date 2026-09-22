import { type DemoTrainingSession } from "@/entities/training-session";
export interface SessionTableProps {
  sessions: readonly DemoTrainingSession[];
  label: string;
  emptyTitle?: string;
}
