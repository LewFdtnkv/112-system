import type { ReactNode } from "react";

export interface TrainingPanelProps {
  condition?: ReactNode;
  instruction: string;
  reference?: ReactNode;
  aside?: ReactNode;
  navigation?: ReactNode;
  children: ReactNode;
}
