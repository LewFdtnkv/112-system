import { createContext, createElement, useContext } from "react";
import type {
  DDSWorkspaceContextValue,
  DDSWorkspaceProviderProps,
} from "../types/DDSControls";

const Context = createContext<DDSWorkspaceContextValue | null>(null);

export function DDSWorkspaceProvider({
  value,
  children,
}: DDSWorkspaceProviderProps) {
  return createElement(Context.Provider, { value }, children);
}

export function useDDSWorkspaceContext() {
  const value = useContext(Context);
  if (!value) throw new Error("Controls require DDSWorkspaceProvider");
  return value;
}
