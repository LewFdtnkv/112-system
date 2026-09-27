import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { recordingApi } from "../api/recordingApi";

export function useRecording(id: string | null) {
  return useQuery({
    queryKey: ["recording", id],
    enabled: !!id,
    queryFn: ({ signal }) => recordingApi.detail(id!, signal),
  });
}
export function useRecordingPreview(id: string) {
  const preview = useMutation({
    mutationFn: async () => URL.createObjectURL(await recordingApi.preview(id)),
  });
  const url = preview.data;
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return preview;
}
