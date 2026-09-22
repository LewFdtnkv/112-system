import { createContext, useContext } from "react";
import type { FieldFeedbackMap } from "./types/FieldFeedback";
export const FieldFeedbackContext = createContext<FieldFeedbackMap>({});
export const useFieldFeedback = (key: string) =>
  useContext(FieldFeedbackContext)[key];

export type { FieldFeedback, FieldFeedbackMap } from "./types/FieldFeedback";
