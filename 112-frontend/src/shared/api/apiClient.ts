import { backendApi } from "./backendApi";
import type { Params } from "../types/query";

export const apiId = encodeURIComponent;

export const apiGet = <T>(
  path: string,
  params: Params = {},
  signal?: AbortSignal,
) => backendApi.get(path, { searchParams: params, signal }).json<T>();

export const apiPost = <T>(path: string, json: unknown, signal?: AbortSignal) =>
  backendApi.post(path, { json, signal }).json<T>();
