import type { Attempt } from "@/entities/training";
export interface LearningHelpProps {
  attempt: Attempt;
  busy?: boolean;
  beforeRequest?: () => Promise<void>;
  activity?: number;
  onHighlight: (target: string | null) => void;
}
