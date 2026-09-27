import type { IncidentEditor } from "@/features/incident-editing";
import type { PropsWithChildren } from "react";

export interface IncidentCardContextValue {
  editor: IncidentEditor;
  disabled: boolean;
}

export interface IncidentCardProviderProps extends PropsWithChildren {
  value: IncidentCardContextValue;
}
