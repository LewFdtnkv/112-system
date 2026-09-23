import { createContext, createElement, useContext, useRef } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type {
  DDSWorkspaceContextValue,
  DDSWorkspaceStoreProviderProps,
} from "../types/DDSControls";

const DDSWorkspaceStoreContext =
  createContext<StoreApi<DDSWorkspaceContextValue> | null>(null);

export function DDSWorkspaceStoreProvider({
  value,
  children,
}: DDSWorkspaceStoreProviderProps) {
  const storeRef = useRef<StoreApi<DDSWorkspaceContextValue> | null>(null);
  if (!storeRef.current) storeRef.current = createStore(() => value);
  else if (storeRef.current.getState() !== value)
    storeRef.current.setState(value, true);
  return createElement(
    DDSWorkspaceStoreContext.Provider,
    { value: storeRef.current },
    children,
  );
}

export function useDDSWorkspaceStore<T>(
  selector: (state: DDSWorkspaceContextValue) => T,
) {
  const store = useContext(DDSWorkspaceStoreContext);
  if (!store) throw new Error("DDS controls require DDSWorkspaceStoreProvider");
  return useStore(store, selector);
}
