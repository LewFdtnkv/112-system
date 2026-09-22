import type { LearningPolicy } from "@/entities/training";
export interface LearningSettingsProps {
  value: LearningPolicy;
  onChange: (value: LearningPolicy) => void;
  role?: string;
}
