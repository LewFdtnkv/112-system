import type { PropsWithChildren } from "react";
import {
  GuideSessionContext,
  useGuideSessionState,
} from "../model/guideSession";
export function GuideSessionProvider({ children }: PropsWithChildren) {
  const value = useGuideSessionState();
  return (
    <GuideSessionContext.Provider value={value}>
      {children}
    </GuideSessionContext.Provider>
  );
}
