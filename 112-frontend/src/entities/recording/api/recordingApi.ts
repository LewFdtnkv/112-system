import { backendApi } from "@/shared/api";
import type {
  Recording,
  RecordingPurpose,
  SpeechInput,
  SpeechVoice,
} from "../types/recording";

export const recordingApi = {
  voices: (signal?: AbortSignal) =>
    backendApi
      .get("telephony/recordings/voices", { signal })
      .json<SpeechVoice[]>(),
  synthesize: (json: SpeechInput) =>
    backendApi
      .post("telephony/recordings/synthesize", { json })
      .json<Recording[]>(),
  retry: (id: string) =>
    backendApi.post(`telephony/recordings/${id}/retry`).json<Recording>(),
  list: (
    params: {
      query?: string;
      purpose?: RecordingPurpose;
      offset?: number;
      limit?: number;
    },
    signal?: AbortSignal,
  ) =>
    backendApi
      .get("telephony/recordings", { searchParams: params, signal })
      .json<{ items: Recording[]; total: number }>(),
  detail: (id: string, signal?: AbortSignal) =>
    backendApi.get(`telephony/recordings/${id}`, { signal }).json<Recording>(),
  upload: (file: File, purpose: RecordingPurpose) =>
    backendApi
      .post("telephony/recordings", {
        searchParams: {
          title: file.name.replace(/\.wav$/i, "").slice(0, 255) || "Запись",
          purpose,
        },
        body: file,
        timeout: 60000,
      })
      .json<Recording>(),
  preview: (id: string) =>
    backendApi.get(`telephony/recordings/${id}/wav`).blob(),
};
