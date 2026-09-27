import { useRef } from "react";
import { useForm } from "react-hook-form";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { recordingApi, recordingQueryOptions } from "@/entities/recording";
import { randomUUID } from "@/shared/lib/uuid";
import type { SpeechDialogProps, SpeechForm } from "../types/SpeechDialog";

export function useSpeechDialog({ kind, initialText }: SpeechDialogProps) {
  const client = useQueryClient();
  const request = useRef({ content: "", id: "" });
  const form = useForm<SpeechForm>({
    defaultValues: {
      title:
        kind === "crew" ? "Голос руководителя бригады" : "Сообщение заявителя",
      voice: "denis",
      text: initialText ?? "",
      greeting: "Здравствуйте. Слушаю вас.",
      acknowledgment: "Принято.",
    },
  });
  const voices = useQuery({
    queryKey: ["speech-voices"],
    queryFn: ({ signal }) => recordingApi.voices(signal),
  });
  const create = useMutation({
    mutationFn: (values: SpeechForm) => {
      const payload = {
        title: values.title,
        voice: values.voice,
        kind,
        ...(kind === "caller"
          ? { text: values.text }
          : {
              greeting: values.greeting,
              acknowledgment: values.acknowledgment,
            }),
      };
      const content = JSON.stringify(payload);
      if (request.current.content !== content)
        request.current = { content, id: randomUUID() };
      return recordingApi.synthesize({
        ...payload,
        request_id: request.current.id,
      });
    },
    onSuccess: (recordings) => {
      for (const recording of recordings)
        client.setQueryData(["recording", recording.id], recording);
      void client.invalidateQueries({ queryKey: ["recordings"] });
    },
  });
  const queries = useQueries({
    queries: (create.data ?? []).map((r) => recordingQueryOptions(r.id)),
  });
  const recordings = queries.map(
    (query, index) => query.data ?? create.data![index],
  );
  return {
    form,
    voices,
    create,
    recordings,
    queryError: queries.find((q) => q.error)?.error,
    ready:
      recordings.length > 0 && recordings.every((r) => r.status === "ready"),
  };
}
