import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { recordingApi } from "../api/recordingApi";
import { recordingQueryOptions } from "./recordingQueries";

export function useRecording(id: string | null) {
  return useQuery(recordingQueryOptions(id));
}
export function useRetryRecording(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => recordingApi.retry(id),
    onSuccess: (recording) => {
      client.setQueryData(["recording", id], recording);
      void client.invalidateQueries({ queryKey: ["recordings"] });
    },
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
