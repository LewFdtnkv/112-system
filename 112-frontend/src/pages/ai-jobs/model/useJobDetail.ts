import { aiJobsApi } from "@/entities/ai-job";
import { useQuery } from "@tanstack/react-query";
export function useJobDetail(id: string) {
  return useQuery({
    queryKey: ["admin-ai-jobs", "detail", id],
    queryFn: ({ signal }) => aiJobsApi.detail(id, signal),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
}
