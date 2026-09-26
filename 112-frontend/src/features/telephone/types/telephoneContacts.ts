import type { CallCommand, CallCue, StationMode } from "@/entities/telephony";

export interface TelephoneContactsProps {
  cues: CallCue[];
  mode?: StationMode;
  crewCallsRequired: boolean;
  ready: boolean;
  busy: boolean;
  onStart: (command: Omit<CallCommand, "command_id">) => void;
}
