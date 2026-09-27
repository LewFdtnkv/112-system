import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assessmentMemoryApi,
  type MemoryExampleInput,
} from "@/entities/training";
import { randomUUID } from "@/shared/lib/uuid";

export function useCreateMemory(onClose: () => void) {
  const client = useQueryClient();
  const form = useForm<MemoryExampleInput>({
    defaultValues: {
      request_id: randomUUID(),
      criterion_code: "description",
      condition: "",
      answer: "",
      verdict: "correct",
      reason: "",
    },
  });
  const criteria = useQuery({
    queryKey: ["memory-criteria"],
    queryFn: ({ signal }) => assessmentMemoryApi.criteria(signal),
  });
  const save = useMutation({
    mutationFn: assessmentMemoryApi.create,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["memory-library"] });
      onClose();
    },
  });
  return { form, criteria, save };
}
