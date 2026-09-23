import { createContext, createElement, useContext, useRef } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type {
  IncidentCardContextValue,
  IncidentCardStoreProviderProps,
} from "../types/IncidentCardContext";

const IncidentCardStoreContext =
  createContext<StoreApi<IncidentCardContextValue> | null>(null);

export function IncidentCardStoreProvider({
  value,
  children,
}: IncidentCardStoreProviderProps) {
  const storeRef = useRef<StoreApi<IncidentCardContextValue> | null>(null);
  if (!storeRef.current) storeRef.current = createStore(() => value);
  else if (storeRef.current.getState() !== value)
    storeRef.current.setState(value, true);
  return createElement(
    IncidentCardStoreContext.Provider,
    { value: storeRef.current },
    children,
  );
}

export function useIncidentCardStore<T>(
  selector: (state: IncidentCardContextValue) => T,
) {
  const store = useContext(IncidentCardStoreContext);
  if (!store) throw new Error("Card panels require IncidentCardStoreProvider");
  return useStore(store, selector);
}

export function useCardSkillDisabled(skill: string) {
  const editor = useIncidentCardStore((state) => state.editor);
  const disabled = useIncidentCardStore((state) => state.disabled);
  return (
    disabled ||
    (!!editor.remote.editableSkills &&
      !editor.remote.editableSkills.includes(skill))
  );
}
