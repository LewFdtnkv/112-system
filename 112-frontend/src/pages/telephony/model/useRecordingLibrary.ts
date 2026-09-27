import { useDebounced } from "@/shared/lib/useDebounced";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { recordingApi } from "@/entities/recording";

export function useRecordingLibrary() {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const searchQuery = useDebounced(query);
  const recordings = useQuery({
    queryKey: ["recordings", "library", page, searchQuery],
    queryFn: ({ signal }) =>
      recordingApi.list(
        { query: searchQuery, offset: page * 20, limit: 20 },
        signal,
      ),
  });
  return {
    page,
    setPage,
    query,
    search: (value: string) => {
      setQuery(value);
      setPage(0);
    },
    recordings,
  };
}
