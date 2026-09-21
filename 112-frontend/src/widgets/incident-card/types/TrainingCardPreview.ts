import type { Attempt } from "@/entities/training";
import { type ReferenceCardSource } from "@/features/incident-editing";
import type { FieldFeedbackMap } from "@/shared/ui/arm/FieldFeedback";
import { type ReactNode } from "react";
export type Props = (
  | { attempt: Attempt; reference?: never }
  | { reference: ReferenceCardSource; attempt?: never }
) & {
  onClose: () => void;
  feedback?: FieldFeedbackMap;
  navigation?: ReactNode;
  unanswered?: boolean;
};
