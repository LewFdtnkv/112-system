import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { telephonyApi } from "@/entities/telephony";
import type { AudioInput } from "@/entities/telephony";
import { scenarioApi } from "@/entities/training";
export function useMedia() {
  const [version, setVersion] = useState("");
  const scenarios = useQuery({
    queryKey: ["telephony-scenarios"],
    queryFn: ({ signal }) => scenarioApi.list({ limit: 100 }, signal),
  });
  const media = useQuery({
    queryKey: ["telephony-media", version],
    enabled: !!version,
    queryFn: ({ signal }) => telephonyApi.media(version, signal),
    refetchInterval: 5000,
  });
  return { version, setVersion, scenarios, media };
}
export function useMediaEditor(cueId: string) {
  const client = useQueryClient();
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["telephony-media"] });
  const update = useMutation({
    mutationFn: (input: AudioInput) => telephonyApi.updateCue(cueId, input),
    onSuccess: refresh,
  });
  const upload = useMutation({
    mutationFn: (file: File) => telephonyApi.upload(cueId, file),
    onSuccess: refresh,
  });
  const preview = useMutation({
    mutationFn: async () =>
      URL.createObjectURL(await telephonyApi.preview(cueId)),
  });
  const url = preview.data ?? "";
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return { update, upload, preview, url };
}
