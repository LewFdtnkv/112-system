import type { useSipPhone } from "../model/useSipPhone";
export type TelephoneSession = ReturnType<typeof useSipPhone>;
export interface TelephoneProps {
  attemptId: string;
  completed: boolean;
}
export type SipState =
  "offline" | "connecting" | "ready" | "incoming" | "dialing" | "talking";
