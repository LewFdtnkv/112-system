import type { AssessmentPolicy } from "@/entities/training";
export type AssessmentPolicyFieldsProps = {
  value: AssessmentPolicy;
  onChange: (value: AssessmentPolicy) => void;
};
