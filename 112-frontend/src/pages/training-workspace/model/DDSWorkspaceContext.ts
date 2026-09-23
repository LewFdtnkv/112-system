import {
  createContext,
  createElement,
  useContext,
  useLayoutEffect,
  useState,
} from "react";
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
  const [store] = useState(() => createStore(() => value));
  useLayoutEffect(() => {
    store.setState(value, true);
  }, [store, value]);
  return createElement(
    DDSWorkspaceStoreContext.Provider,
    { value: store },
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
