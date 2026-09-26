import { attemptApi } from "@/entities/training";
import { useQuery } from "@tanstack/react-query";

const normalize = (value: string) =>
  value.trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е");

export function useAttemptCatalog(
  attemptId: string,
  enabled: boolean,
  search: string,
) {
  const entries = useQuery({
    queryKey: ["attempt-entries", attemptId],
    queryFn: ({ signal }) => attemptApi.allEntries(attemptId, signal),
    enabled,
    staleTime: Infinity,
  });
  const term = normalize(search);
  const catalog = entries.data ?? [];
  return {
    entries,
    matches: term
      ? catalog.filter((entry) =>
          [entry.name, entry.display_name ?? "", entry.code].some((value) =>
            normalize(value).includes(term),
          ),
        )
      : [],
    popular: catalog
      .filter((entry) => entry.is_popular)
      .sort((a, b) => (a.popular_order ?? 0) - (b.popular_order ?? 0))
      .slice(0, 11),
  };
}
