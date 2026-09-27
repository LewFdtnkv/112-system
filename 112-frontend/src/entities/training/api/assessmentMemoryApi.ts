import { backendApi } from "@/shared/api";
import type {
  AssessmentMemory,
  MemoryExampleInput,
  MemoryCriterion,
  MemoryLibraryItem,
  MemoryLibraryPage,
  MemoryLibraryFilter,
  RetrievedAssessmentExample,
  AssessmentMemoryInput,
  AssessmentMemoryTarget,
} from "../types/assessmentMemory";

function path(target: AssessmentMemoryTarget) {
  const id = encodeURIComponent;
  return `lessons/${id(target.lessonId)}/students/${id(target.studentId)}/attempts/${id(target.attemptId)}/assessment-memory`;
}
export const assessmentMemoryApi = {
  criteria: (signal?: AbortSignal) =>
    backendApi
      .get("assessment-memory/criteria", { signal })
      .json<MemoryCriterion[]>(),
  create: (input: MemoryExampleInput) =>
    backendApi
      .post("assessment-memory", { json: input })
      .json<MemoryLibraryItem>(),
  library: (filter: MemoryLibraryFilter, signal?: AbortSignal) => {
    const { kind, ...rest } = filter;
    return backendApi
      .get("assessment-memory", {
        searchParams: { ...rest, ...(kind ? { kind } : {}), limit: 20 },
        signal,
      })
      .json<MemoryLibraryPage>();
  },
  setEnabled: (id: string, enabled: boolean) =>
    backendApi
      .patch(`assessment-memory/${encodeURIComponent(id)}`, {
        json: { enabled },
      })
      .json<MemoryLibraryItem>(),
  remove: (id: string) =>
    backendApi
      .delete(`assessment-memory/${encodeURIComponent(id)}`)
      .json<MemoryLibraryItem>(),
  retrieved: (target: AssessmentMemoryTarget, signal?: AbortSignal) =>
    backendApi
      .get(`${path(target)}/retrieval`, { signal })
      .json<Record<string, RetrievedAssessmentExample[]>>(),
  list: (target: AssessmentMemoryTarget, signal?: AbortSignal) =>
    backendApi.get(path(target), { signal }).json<AssessmentMemory[]>(),
  publish: (target: AssessmentMemoryTarget, input: AssessmentMemoryInput) =>
    backendApi.post(path(target), { json: input }).json<AssessmentMemory>(),
  withdraw: (target: AssessmentMemoryTarget, exampleId: string) =>
    backendApi
      .delete(`${path(target)}/${encodeURIComponent(exampleId)}`)
      .json<AssessmentMemory>(),
};
