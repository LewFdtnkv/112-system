export type CallState = "incoming" | "accepted" | "declined";

export type ConnectionState = "connected" | "reconnecting";

export interface TrainingStripProps {
  scenarioTitle: string;
  isSessionActive: boolean;
  elapsedSeconds: number;
  normSeconds: number;
  callState: CallState;
  connectionState: ConnectionState;
  onAcceptCall: () => void;
  onDeclineCall: () => void;
  onToggleConnection: () => void;
}
