import { backendApi } from "@/shared/api";
import type { DDSGenerationInput } from "../types/ddsGeneration";
import type { GenerationJob } from "../types/generation";

export const ddsGenerationApi = {
  create: (cardId: string, input: DDSGenerationInput) =>
    backendApi
      .post(`cards/${encodeURIComponent(cardId)}/dds-generations`, {
        json: input,
        retry: 0,
      })
      .json<GenerationJob>(),
  jobs: (cardId: string, signal?: AbortSignal) =>
    backendApi
      .get(`cards/${encodeURIComponent(cardId)}/dds-generations`, { signal })
      .json<GenerationJob[]>(),
};
