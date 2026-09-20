import { createContext, useContext } from "react";

export type FieldFeedback = {
  tone: "success" | "error" | "warning" | "neutral";
  text: string;
};
export type FieldFeedbackMap = Record<string, FieldFeedback>;
export const FieldFeedbackContext = createContext<FieldFeedbackMap>({});
export const useFieldFeedback = (key: string) =>
  useContext(FieldFeedbackContext)[key];
