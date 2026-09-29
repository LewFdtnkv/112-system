import { type IncidentCard } from "@/entities/incident-card";
import { type IncidentEditorOptions } from "@/features/incident-editing";
import { type FieldFeedbackMap } from "@/shared/ui/arm/FieldFeedback";
import { type ReactNode } from "react";
import type { useIncidentEditor } from "@/features/incident-editing";
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

export type IncidentCardEditor = ReturnType<typeof useIncidentEditor>;
export type IncidentCardModal =
  "map" | "calls" | "sms" | "timing" | "translate";

export interface IncidentCardFooterProps {
  props: IncidentCardFormProps;
  editor: IncidentCardEditor;
  viewing: boolean;
  disabled: boolean;
  locked: (skill: string) => boolean;
  activeService?: string;
  setActiveService: (service?: string) => void;
  servicesOpen: boolean;
  setServicesOpen: (open: boolean) => void;
  commentOpen: boolean;
  setCommentOpen: (open: boolean) => void;
  setPreview: (preview: boolean) => void;
  setModal: (modal?: IncidentCardModal) => void;
  onClose: () => void;
}

export interface IncidentCardAuxiliaryDialogProps {
  props: IncidentCardFormProps;
  editor: IncidentCardEditor;
  locked: (skill: string) => boolean;
  modal?: IncidentCardModal;
  setModal: (modal?: IncidentCardModal) => void;
}
