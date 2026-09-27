import { queryOptions } from "@tanstack/react-query";
import { recordingApi } from "../api/recordingApi";

export const recordingQueryOptions = (id: string | null) =>
  queryOptions({
    queryKey: ["recording", id],
    enabled: !!id,
    queryFn: ({ signal }) => recordingApi.detail(id!, signal),
    refetchInterval: (query) =>
      ["queued", "preparing"].includes(query.state.data?.status ?? "")
        ? 2000
        : false,
  });
