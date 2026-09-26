import type { ReactNode } from "react";
import type { CardTemplate } from "@/entities/training";

export type CardSectionKind = "common" | "operator_112" | "dds";
export interface CardRoleSectionProps {
  kind: CardSectionKind;
  children: ReactNode;
}
export interface CardDetailsProps {
  card: CardTemplate;
  onPreview: () => void;
}
