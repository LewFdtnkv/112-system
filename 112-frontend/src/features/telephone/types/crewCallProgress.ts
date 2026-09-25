import type { CrewNotification } from "@/entities/telephony";
export interface CrewCallProgressProps {
  calls: CrewNotification[];
  enabled: boolean;
}
export interface DialogueStatusProps {
  phase?: string;
}
