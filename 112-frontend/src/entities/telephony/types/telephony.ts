export type StationMode = "external" | "browser" | "phone";
export interface Station {
  id: string;
  name: string;
  mode: StationMode;
  provider: string;
  endpoint: string;
  student_id: string | null;
  attempt_id: string | null;
  enabled: boolean;
  provisioned: boolean;
  error: string | null;
}
export interface StationInput {
  name: string;
  mode: StationMode;
  provider: string;
  endpoint: string;
  student_id: string | null;
}
export interface TrainingCall {
  id: string;
  attempt_id: string;
  command_id: string;
  station_id: string | null;
  contact_name: string;
  endpoint_key: string;
  status: string;
  direction: "incoming" | "outgoing";
  transport: "manual" | "callback";
  started_at: string;
  connected_at: string | null;
  ended_at: string | null;
  result: string | null;
  cancel_requested: boolean;
  provider_confirmed: boolean;
}
export interface CallCue {
  id: string;
  name: string;
  contact_key: string;
  status: string;
  duration_seconds: number | null;
}
export interface TelephoneState {
  enabled: boolean;
  station: Station | null;
  cues: CallCue[];
  calls: TrainingCall[];
}
export interface SipCredentials {
  username: string;
  password: string;
  domain: string;
  ws_url: string;
}
export interface AudioInput {
  text: string;
  voice: string;
  generator_version?: string;
}
export interface SpeechAsset extends AudioInput {
  id: string;
  status: string;
  duration_seconds: number | null;
  error: string | null;
}
export interface MediaCue {
  id: string;
  card_title: string;
  contact_name: string;
  audio: SpeechAsset;
}
export interface CallCommand {
  command_id: string;
  cue_id: string;
  direction: "incoming" | "outgoing";
  transport: "manual" | "callback";
}
