import type { CardAudio } from "@/entities/recording";
export interface CardAudioProps {
  value: CardAudio;
  onChange?: (value: CardAudio) => void;
  kind: "caller" | "crew";
}
