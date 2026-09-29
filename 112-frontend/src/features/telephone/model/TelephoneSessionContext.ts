import { createContext, useContext } from "react";
import type { TelephoneSession } from "../types/telephone";
export const TelephoneSessionContext = createContext<TelephoneSession | null>(
  null,
);
export function useTelephoneSession() {
  const session = useContext(TelephoneSessionContext);
  if (!session) throw new Error("TelephoneSessionProvider is required");
  return session;
}
