import type { RefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { telephonyApi } from "@/entities/telephony";
import type { CallCommand } from "@/entities/telephony";
import { useSipPhone } from "./useSipPhone";
import type { TelephoneProps } from "../types/telephone";
export function useTelephone(
  { attemptId, completed }: TelephoneProps,
  audioRef: RefObject<HTMLAudioElement | null>,
) {
  const client = useQueryClient();
  const key = ["telephone", attemptId];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => telephonyApi.state(attemptId, signal),
    refetchInterval: (query) =>
      completed || query.state.data?.enabled === false ? false : 2000,
  });
  const phone = useSipPhone(audioRef);
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const binding = useMutation({
    mutationFn: async () => {
      const station = await telephonyApi.bind(attemptId);
      if (station.mode === "browser")
        await phone.connect(await telephonyApi.sip(attemptId));
    },
    onSuccess: refresh,
  });
  const start = useMutation({
    mutationFn: async (input: Omit<CallCommand, "command_id">) => {
      const call = await telephonyApi.start(attemptId, {
        ...input,
        command_id: crypto.randomUUID(),
      });
      if (
        query.data?.station?.mode === "browser" &&
        input.transport === "manual"
      ) {
        try {
          await phone.dial();
        } catch (error) {
          await telephonyApi.cancel(attemptId, call.id);
          throw error;
        }
      }
      return call;
    },
    onSettled: refresh,
  });
  const active = query.data?.calls.find((call) =>
    ["dialing", "connected"].includes(call.status),
  );
  const control = useMutation({
    mutationFn: async (action: "accept" | "hangup" | "play") => {
      if (action === "accept") await phone.accept();
      if (action === "play") await phone.play();
      if (action === "hangup") {
        await phone.hangup();
        if (active) await telephonyApi.cancel(attemptId, active.id);
      }
    },
    onSettled: refresh,
  });
  return {
    query,
    phone,
    binding,
    start,
    control,
    active,
    busy: binding.isPending || start.isPending || control.isPending,
    error: binding.error || start.error || control.error || query.error,
  };
}
