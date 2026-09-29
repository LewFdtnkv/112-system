import {
  assessmentMemoryApi,
  type AssessmentMemoryInput,
  type AssessmentMemoryTarget,
} from "@/entities/training";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useAssessmentMemory(
  target: AssessmentMemoryTarget,
  enabled = true,
) {
  return useQuery({
    queryKey: ["assessment-memory", target],
    queryFn: ({ signal }) => assessmentMemoryApi.list(target, signal),
    enabled,
  });
}
export function useMemoryCommands(target: AssessmentMemoryTarget) {
  const client = useQueryClient();
  const onSuccess = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["assessment-memory", target] }),
      client.invalidateQueries({ queryKey: ["memory-library"] }),
    ]);
  const publish = useMutation({
    mutationFn: (input: AssessmentMemoryInput) =>
      assessmentMemoryApi.publish(target, input),
    onSuccess,
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => assessmentMemoryApi.withdraw(target, id),
    onSuccess,
  });
  return { publish, withdraw };
}

export function useRetrievedExamples(
  target: AssessmentMemoryTarget,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["assessment-retrieval", target],
    queryFn: ({ signal }) => assessmentMemoryApi.retrieved(target, signal),
    enabled,
  });
}
