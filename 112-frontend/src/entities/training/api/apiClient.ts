import { backendApi } from "@/shared/api";
import type { Params } from "../types/trainingApi";

export const apiId = encodeURIComponent;

export const apiGet = <T>(
  path: string,
  params: Params = {},
  signal?: AbortSignal,
) => backendApi.get(path, { searchParams: params, signal }).json<T>();

export const apiPost = <T>(path: string, json: unknown, signal?: AbortSignal) =>
  backendApi.post(path, { json, signal }).json<T>();
