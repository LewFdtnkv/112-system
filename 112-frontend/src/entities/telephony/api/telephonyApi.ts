import { backendApi } from "@/shared/api";
import type {
  AudioInput,
  CallCommand,
  MediaCue,
  SipCredentials,
  SpeechAsset,
  Station,
  StationInput,
  TelephoneState,
  TrainingCall,
} from "../types/telephony";
const base = "telephony";
const id = encodeURIComponent;
export const telephonyApi = {
  stations: (signal?: AbortSignal) =>
    backendApi.get(`${base}/stations`, { signal }).json<Station[]>(),
  createStation: (json: StationInput) =>
    backendApi.post(`${base}/stations`, { json }).json<Station>(),
  updateStation: (
    stationId: string,
    json: { student_id: string | null; enabled: boolean },
  ) =>
    backendApi
      .patch(`${base}/stations/${id(stationId)}`, { json })
      .json<Station>(),
  credentials: (stationId: string) =>
    backendApi
      .get(`${base}/stations/${id(stationId)}/credentials`)
      .json<SipCredentials>(),
  state: (attempt: string, signal?: AbortSignal) =>
    backendApi
      .get(`${base}/attempts/${id(attempt)}`, { signal })
      .json<TelephoneState>(),
  bind: (attempt: string) =>
    backendApi.post(`${base}/attempts/${id(attempt)}/bind`).json<Station>(),
  sip: (attempt: string) =>
    backendApi
      .get(`${base}/attempts/${id(attempt)}/sip`)
      .json<SipCredentials>(),
  start: (attempt: string, json: CallCommand) =>
    backendApi
      .post(`${base}/attempts/${id(attempt)}/calls`, { json })
      .json<TrainingCall>(),
  cancel: (attempt: string, call: string) =>
    backendApi
      .post(`${base}/attempts/${id(attempt)}/calls/${id(call)}/cancel`)
      .json<TrainingCall>(),
  media: (version: string, signal?: AbortSignal) =>
    backendApi
      .get(`${base}/scenarios/${id(version)}/media`, { signal })
      .json<MediaCue[]>(),
  updateCue: (cue: string, json: AudioInput) =>
    backendApi.put(`${base}/cues/${id(cue)}`, { json }).json<SpeechAsset>(),
  upload: (cue: string, body: File) =>
    backendApi
      .put(`${base}/cues/${id(cue)}/wav`, {
        body,
        timeout: 60000,
        headers: { "Content-Type": "audio/wav" },
      })
      .json<SpeechAsset>(),
  preview: (cue: string) =>
    backendApi.get(`${base}/cues/${id(cue)}/wav`).blob(),
  lessonCalls: (lesson: string, signal?: AbortSignal) =>
    backendApi
      .get(`${base}/lessons/${id(lesson)}/calls`, { signal })
      .json<TrainingCall[]>(),
};
