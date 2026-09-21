import { backendApi } from "@/shared/api";
import type {
  GenerationJob,
  GenerationOptions,
  GenerationParameters,
} from "../model/generation";
import type { Page } from "../model/types";

export const generationApi = {
  options: (signal?: AbortSignal) =>
    backendApi
      .get("card-generations/options", { signal })
      .json<GenerationOptions>(),
  create: (
    request_id: string,
    count: number,
    parameters: GenerationParameters,
  ) =>
    backendApi
      .post("card-generations", {
        json: { request_id, count, parameters },
        retry: 0,
      })
      .json<GenerationJob[]>(),
  jobs: (offset: number, signal?: AbortSignal) =>
    backendApi
      .get("card-generations", {
        searchParams: { offset, limit: 10, pending_only: true },
        signal,
      })
      .json<Page<GenerationJob>>(),
  retry: (id: string) =>
    backendApi
      .post(`card-generations/${encodeURIComponent(id)}/retry`)
      .json<GenerationJob>(),
};
