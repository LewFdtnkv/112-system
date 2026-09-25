import { createContext, useContext } from "react";
import type { ValidationContextValue } from "../types";
export const ValidationContext = createContext<ValidationContextValue | null>(
  null,
);
export const useValidation = () => useContext(ValidationContext);
export const useFieldIssue = (name?: string) =>
  useValidation()?.issues.find((issue) => issue.path === name)?.message;
