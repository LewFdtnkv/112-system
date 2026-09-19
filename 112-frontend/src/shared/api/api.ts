import ky from "ky";

import { appConfig } from "@/shared/config/appConfig";

import { fakeFetch } from "./fakeFetch";

export const api = ky.create({
  prefix: appConfig.apiUrl,
  timeout: 10_000,
  retry: 0,
  fetch: appConfig.useFakeApi ? fakeFetch : undefined,
});
