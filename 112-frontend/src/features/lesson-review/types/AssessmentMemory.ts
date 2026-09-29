import type {
  AssessmentMemory,
  AssessmentMemoryInput,
  AssessmentMemoryTarget,
  SemanticFinding,
} from "@/entities/training";

export type AssessmentMemoryProps = {
  target: AssessmentMemoryTarget;
  finding: SemanticFinding;
  entries: AssessmentMemory[];
};
export type MemoryDraft = AssessmentMemoryInput;

export type RetrievedExamplesProps = { target: AssessmentMemoryTarget };
