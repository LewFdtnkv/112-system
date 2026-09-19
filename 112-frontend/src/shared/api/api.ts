import ky from "ky";

import { appConfig } from "@/shared/config/appConfig";

import { fakeFetch } from "./fakeFetch";

export const api = ky.create({
  prefix: new URL(appConfig.apiUrl.replace(/\/?$/, "/"), window.location.origin)
    .href,
  timeout: 10_000,
  retry: 0,
  fetch: appConfig.useFakeApi ? fakeFetch : undefined,
});
