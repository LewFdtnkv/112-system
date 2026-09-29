import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cardApi } from "@/entities/training";
import { useDebounced } from "@/shared/lib/useDebounced";
import type { GenerationMemoryFilter } from "../types/generationMemory";

export function useGenerationMemory() {
  const [filter, setFilter] = useState<GenerationMemoryFilter>({
    q: "",
    state: "enabled",
    page: 0,
  });
  const [selectedId, select] = useState<string>();
  const q = useDebounced(filter.q);
  const query = useQuery({
    queryKey: ["generation-memory", { ...filter, q }],
    queryFn: ({ signal }) =>
      cardApi.cards(
        {
          q,
          limit: 20,
          offset: filter.page * 20,
          ...(filter.state === "all"
            ? {}
            : { generation_example: filter.state === "enabled" }),
        },
        signal,
      ),
  });
  const change = (next: Partial<GenerationMemoryFilter>) =>
    setFilter((previous) => ({ ...previous, page: 0, ...next }));
  return { filter, query, change, selectedId, select };
}
