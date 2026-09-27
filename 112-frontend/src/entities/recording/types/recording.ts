export type RecordingPurpose = "caller" | "greeting" | "acknowledgment";
export interface Recording {
  id: string;
  title: string;
  purpose: RecordingPurpose;
  status: string;
  duration_seconds: number | null;
  created_at: string;
  usages: { kind: "card" | "scenario"; id: string; title: string }[];
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
