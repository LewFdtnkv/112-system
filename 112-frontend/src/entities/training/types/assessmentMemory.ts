import type { SemanticFinding } from "./semanticAssessment";

export interface AssessmentMemory {
  id: string;
  criterion_code: string;
  verdict: SemanticFinding["verdict"];
  reason: string;
  active: boolean;
  embedded_at: string | null;
  created_at: string;
}

export interface AssessmentMemoryInput {
  request_id: string;
  criterion_code: string;
  verdict: SemanticFinding["verdict"];
  reason: string;
}

export interface AssessmentMemoryTarget {
  lessonId: string;
  studentId: string;
  attemptId: string;
}

export interface RetrievedAssessmentExample {
  id: string;
  source_key: string;
  condition: string;
  answer: string;
  verdict: SemanticFinding["verdict"];
  reason: string;
  similarity: number;
}

export interface MemoryLibraryItem extends AssessmentMemory {
  kind: "text" | "services" | "dds";
  role: string;
  source: "shared" | "teacher";
  condition: string;
  answer: string;
  enabled: boolean;
  removed: boolean;
}
export interface MemoryLibraryPage {
  items: MemoryLibraryItem[];
  total: number;
  limit: number;
  offset: number;
}
export interface MemoryLibraryFilter {
  q: string;
  kind: "" | MemoryLibraryItem["kind"];
  state: "all" | "enabled" | "disabled";
  include_removed: boolean;
  offset: number;
}

export interface MemoryCriterion {
  code: string;
  label: string;
  kind: MemoryLibraryItem["kind"];
}
export interface MemoryExampleInput extends AssessmentMemoryInput {
  condition: string;
  answer: string;
}
