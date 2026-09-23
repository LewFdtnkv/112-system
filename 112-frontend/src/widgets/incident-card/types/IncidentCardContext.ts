import type { IncidentEditor } from "@/features/incident-editing";
import type { PropsWithChildren } from "react";

export interface IncidentCardContextValue {
  editor: IncidentEditor;
  disabled: boolean;
}

export interface IncidentCardStoreProviderProps extends PropsWithChildren {
  value: IncidentCardContextValue;
}
