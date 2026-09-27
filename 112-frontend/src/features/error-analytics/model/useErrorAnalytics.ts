import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "@/entities/training";
import type { SelectOption } from "@/shared/ui/ServerSelect";

export function useErrorAnalytics(track: string) {
  const [filters, setFilters] = useState({
    role: "all",
    days: 90,
    page: 0,
    group: null as SelectOption | null,
  });
  const change = (patch: Partial<typeof filters>) =>
    setFilters((current) => ({ ...current, ...patch, page: 0 }));
  const query = useQuery({
    queryKey: ["analytics", "errors", track, filters],
    queryFn: ({ signal }) =>
      analyticsApi.errors(
        {
          track,
          role: filters.role,
          days: filters.days,
          ...(filters.group ? { group_id: filters.group.id } : {}),
          offset: filters.page * 20,
        },
        signal,
      ),
  });
  return {
    filters,
    change,
    query,
    setPage: (page: number) => setFilters((current) => ({ ...current, page })),
  };
}
