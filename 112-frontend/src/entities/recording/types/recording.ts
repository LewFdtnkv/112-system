export type RecordingPurpose = "caller" | "greeting" | "acknowledgment";
export interface Recording {
  id: string;
  title: string;
  purpose: RecordingPurpose;
  status: string;
  duration_seconds: number | null;
  created_at: string;
  usages: { kind: "card" | "scenario"; id: string; title: string }[];
  text?: string | null;
  voice?: string | null;
  error?: string | null;
}
export interface SpeechVoice {
  id: string;
  label: string;
}
export interface RecordingStatusProps {
  recording: Recording;
}
export interface SpeechInput {
  request_id: string;
  title: string;
  voice: string;
  kind: "caller" | "crew";
  text?: string;
  greeting?: string;
  acknowledgment?: string;
}
export interface CardAudio {
  caller_ids: string[];
  crew_variants: { greeting_id: string; acknowledgment_id: string }[];
}
export interface RecordingPickerProps {
  purpose: RecordingPurpose;
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}
