import { createContext, useContext, useState } from "react";
export function useGuideSessionState() {
  const [paused, setPaused] = useState(false);
  return { paused, setPaused };
}
export const GuideSessionContext = createContext<ReturnType<
  typeof useGuideSessionState
> | null>(null);
export function useGuideSession() {
  const value = useContext(GuideSessionContext);
  if (!value) throw new Error("GuideSessionProvider is required");
  return value;
}
