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
  IncidentCardContextValue,
  IncidentCardStoreProviderProps,
} from "../types/IncidentCardContext";

const IncidentCardStoreContext =
  createContext<StoreApi<IncidentCardContextValue> | null>(null);

export function IncidentCardStoreProvider({
  value,
  children,
}: IncidentCardStoreProviderProps) {
  const [store] = useState(() => createStore(() => value));
  useLayoutEffect(() => {
    store.setState(value, true);
  }, [store, value]);
  return createElement(
    IncidentCardStoreContext.Provider,
    { value: store },
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
