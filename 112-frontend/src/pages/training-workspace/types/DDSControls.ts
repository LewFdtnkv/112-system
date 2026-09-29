import type { useDDSWorkspace } from "../model/useDDSWorkspace";
import type { PropsWithChildren } from "react";

export type DDSWorkspaceContextValue = ReturnType<typeof useDDSWorkspace>;

export interface DDSWorkspaceProviderProps extends PropsWithChildren {
  value: DDSWorkspaceContextValue;
}
