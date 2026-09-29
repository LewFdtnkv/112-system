export type FieldFeedback = {
  tone: "success" | "error" | "warning" | "neutral";
  text: string;
};

export type FieldFeedbackMap = Record<string, FieldFeedback>;
