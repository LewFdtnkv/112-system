import { createContext, useContext } from "react";
import type { IncidentCardContextValue } from "../types/IncidentCardContext";

export const IncidentCardContext =
  createContext<IncidentCardContextValue | null>(null);

export function useIncidentCardContext() {
  const value = useContext(IncidentCardContext);
  if (!value) throw new Error("Card panels require IncidentCardContext");
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
