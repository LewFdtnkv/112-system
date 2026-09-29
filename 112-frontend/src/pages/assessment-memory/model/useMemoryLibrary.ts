import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assessmentMemoryApi,
  type MemoryLibraryFilter,
  type MemoryLibraryItem,
} from "@/entities/training";
import { useDebounced } from "@/shared/lib/useDebounced";

export function useMemoryLibrary() {
  const [filter, setFilter] = useState<MemoryLibraryFilter>({
    q: "",
    kind: "",
    state: "all",
    include_removed: false,
    offset: 0,
  });
  const [selected, setSelected] = useState<MemoryLibraryItem | null>(null);
  const [removing, setRemoving] = useState(false);
  const q = useDebounced(filter.q, 300);
  const query = useQuery({
    queryKey: ["memory-library", { ...filter, q }],
    queryFn: ({ signal }) =>
      assessmentMemoryApi.library({ ...filter, q }, signal),
  });
  const client = useQueryClient();
  const onSuccess = (row: MemoryLibraryItem) => {
    setSelected(row.removed ? null : row);
    setRemoving(false);
    void client.invalidateQueries({ queryKey: ["memory-library"] });
    void client.invalidateQueries({ queryKey: ["assessment-memory"] });
  };
  const toggle = useMutation({
    mutationFn: (row: MemoryLibraryItem) =>
      assessmentMemoryApi.setEnabled(row.id, !row.enabled),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (row: MemoryLibraryItem) => assessmentMemoryApi.remove(row.id),
    onSuccess,
  });
  const change = (value: Partial<MemoryLibraryFilter>) =>
    setFilter((old) => ({ ...old, offset: 0, ...value }));
  const select = (row: MemoryLibraryItem | null) => {
    setSelected(row);
    setRemoving(false);
    toggle.reset();
    remove.reset();
  };
  return {
    query,
    filter,
    change,
    selected,
    select,
    removing,
    setRemoving,
    toggle,
    remove,
  };
}
