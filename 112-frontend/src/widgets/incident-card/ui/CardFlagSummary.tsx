import { useFieldFeedback } from "@/shared/ui/arm/FieldFeedback";
import type { CardFlagSummaryProps } from "../types/CardFlagSummary";
export function CardFlagSummary({ label, value }: CardFlagSummaryProps) {
  const feedback = useFieldFeedback(label);
  return (
    <span
      className="arm-flag-summary"
      data-feedback={feedback?.tone}
      title={feedback?.text}
    >
      {label}: {value}
    </span>
  );
}
