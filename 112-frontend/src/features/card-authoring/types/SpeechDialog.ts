import type { Recording } from "@/entities/recording";

export interface SpeechDialogProps {
  kind: "caller" | "crew";
  initialText?: string;
  onClose: () => void;
  onAdd: (recordings: Recording[]) => void;
}
export interface SpeechForm {
  title: string;
  voice: string;
  text: string;
  greeting: string;
  acknowledgment: string;
}
