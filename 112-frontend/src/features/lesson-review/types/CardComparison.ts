import { type ReactNode } from "react";
import { type ComparisonField, type ReviewedCard } from "../model/comparison";
export type VerdictProps = {
  field: ComparisonField;
  submitted: boolean;
};

export type CardComparisonProps = {
  row: ReviewedCard;
  actions?: ReactNode;
};
