import { type IncidentCard } from "@/entities/incident-card";
import { type IncidentEditorOptions } from "@/features/incident-editing";
import { type FieldFeedbackMap } from "@/shared/ui/arm/FieldFeedback";
import { type ReactNode } from "react";
export interface IncidentCardDialogProps extends Omit<
  IncidentEditorOptions,
  "card"
> {
  card: IncidentCard | null;
  elapsedSeconds: number;
  normSeconds: number;
  onClose: () => void;
  renderMap?: (address: string) => ReactNode;
  readOnly?: boolean;
  readOnlyLayout?: "summary" | "form";
  fieldFeedback?: FieldFeedbackMap;
  responseFooter?: ReactNode;
  trainingNotice?: ReactNode;
}

export type IncidentCardFormProps = Omit<IncidentCardDialogProps, "card"> & {
  card: IncidentCard;
  titleId: string;
};
