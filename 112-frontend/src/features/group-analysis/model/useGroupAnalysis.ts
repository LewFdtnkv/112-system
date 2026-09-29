import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { groupAnalysisApi } from "../api/groupAnalysisApi";

export function useGroupAnalysis(id: string) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("dds");
  const [days, setDays] = useState(30);
  const client = useQueryClient();
  const key = ["group-analysis", id, role, days];
  const report = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => groupAnalysisApi.read(id, role, days, signal),
    enabled: open,
    refetchInterval: (q) =>
      ["queued", "running"].includes(q.state.data?.job?.status ?? "")
        ? 5000
        : false,
  });
  const create = useMutation({
    mutationFn: () => groupAnalysisApi.create(id, role, days),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  return { open, setOpen, role, setRole, days, setDays, report, create };
}
