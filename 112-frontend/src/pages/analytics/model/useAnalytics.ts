import { activityApi, trainingApi } from "@/entities/training";
import { download } from "@/shared/lib/download";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

export function useAnalytics() {
  const exportReport = useMutation({
    mutationFn: async () =>
      download(await activityApi.report("xlsx"), "training-report.xlsx"),
  });
  const [page, setPage] = useState(0);
  const [track, setTrack] = useState("training");
  const query = useQuery({
    queryKey: ["analytics", page, track],
    queryFn: ({ signal }) =>
      trainingApi.analytics({ offset: page * 20, track }, signal),
  });
  return { exportReport, page, setPage, track, setTrack, query };
}
