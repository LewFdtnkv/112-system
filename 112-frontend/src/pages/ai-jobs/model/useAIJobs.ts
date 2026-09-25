import { aiJobsApi } from "@/entities/ai-job";
import { useDebounced } from "@/shared/lib/useDebounced";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
export function useAIJobs() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const offset = Number(params.get("offset") ?? 0);
  const filters = {
    q: useDebounced(q),
    status: params.get("status") ?? "",
    purpose: params.get("purpose") ?? "",
    offset: Number.isSafeInteger(offset) && offset >= 0 ? offset : 0,
  };
  const query = useQuery({
    queryKey: ["admin-ai-jobs", "list", filters],
    queryFn: ({ signal }) => aiJobsApi.list(filters, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
  const selectedId = params.get("job");
  const update = (key: string, value: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        if (["q", "status", "purpose"].includes(key)) next.delete("offset");
        return next;
      },
      { replace: true },
    );
  return { query, filters: { ...filters, q }, selectedId, update };
}
