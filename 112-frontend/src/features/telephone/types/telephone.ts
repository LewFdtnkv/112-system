export interface TelephoneProps {
  attemptId: string;
  completed: boolean;
}
export type SipState =
  "offline" | "connecting" | "ready" | "incoming" | "dialing" | "talking";
