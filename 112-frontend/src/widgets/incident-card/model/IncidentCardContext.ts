import { createContext, createElement, useContext } from "react";
import type {
  IncidentCardContextValue,
  IncidentCardProviderProps,
} from "../types/IncidentCardContext";

const Context = createContext<IncidentCardContextValue | null>(null);

export function IncidentCardProvider({
  value,
  children,
}: IncidentCardProviderProps) {
  return createElement(Context.Provider, { value }, children);
}

export function useIncidentCardContext() {
  const value = useContext(Context);
  if (!value) throw new Error("Controls require IncidentCardProvider");
  return value;
}

export function useCardSkillDisabled(skill: string) {
  const { editor, disabled } = useIncidentCardContext();
  return (
    disabled ||
    (!!editor.remote.editableSkills &&
      !editor.remote.editableSkills.includes(skill))
  );
}
