import { createContext, useContext } from "react";
import type { DDSWorkspaceContextValue } from "../types/DDSControls";

export const DDSWorkspaceContext =
  createContext<DDSWorkspaceContextValue | null>(null);

export function useDDSWorkspaceContext() {
  const value = useContext(DDSWorkspaceContext);
  if (!value) throw new Error("DDS controls require DDSWorkspaceContext");
  return value;
}
