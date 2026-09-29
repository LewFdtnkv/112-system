import { appConfig } from "@/shared/config/appConfig";
import ky from "ky";
import type { Authentication } from "../types/backendApi";
let authentication: Authentication | undefined;
export const configureAuthentication = (handlers: Authentication) => {
  authentication = handlers;
};
const prefix = new URL(
  appConfig.apiUrl.replace(/\/?$/, "/"),
  window.location.origin,
).href;
export const publicBackendApi = ky.create({
  prefix,
  retry: 0,
  timeout: 10_000,
  fetch: (input, init) => globalThis.fetch(input, init),
});
// Clone before sending: replay protected requests once after an expired token.
export const backendApi = publicBackendApi.extend({
  fetch: async (input, init) => {
    const original = new Request(input, init);
    const send = (token: string | undefined) => {
      const request = original.clone();
      if (token) request.headers.set("Authorization", `Bearer ${token}`);
      return globalThis.fetch(request);
    };
    const generation = authentication?.generation();
    const token = authentication?.accessToken();
    let response = await send(token);
    if (generation !== authentication?.generation())
      throw new DOMException("Session changed", "AbortError");
    if (response.status === 401 && token && authentication) {
      if (token === authentication.accessToken())
        await authentication.refresh();
      if (
        generation !== authentication.generation() ||
        !authentication.accessToken()
      )
        return response;
      response = await send(authentication.accessToken());
    }
    if (generation !== authentication?.generation())
      throw new DOMException("Session changed", "AbortError");
    if (response.status === 401) authentication?.expired();
    if (response.status === 403) {
      const data = await response
        .clone()
        .json()
        .catch(() => null);
      if (data?.detail === "password_change_required")
        authentication?.passwordRequired();
    }
    return response;
  },
});
