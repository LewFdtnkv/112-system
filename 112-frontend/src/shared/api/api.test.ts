import { afterEach, expect, it, vi } from "vitest";

import { getApiError } from "./errors";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("preserves the API prefix when joining a request path", async () => {
  vi.stubEnv("VITE_API_URL", "https://api.example.test/v1/");
  const { api } = await import("./api");
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ ok: true }),
  );

  await api.get("probe", { fetch }).json();

  const [request] = fetch.mock.calls[0];
  expect(request).toBeInstanceOf(Request);
  expect((request as Request).url).toBe("https://api.example.test/v1/probe");
});

it("returns an HTTP error without retrying or exposing response details", async () => {
  vi.stubEnv("VITE_API_URL", "https://api.example.test/v1");
  const { api } = await import("./api");
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response("Private details", { status: 503 }),
  );
  const error = await api
    .get("probe", { fetch })
    .catch((error: unknown) => error);

  expect(fetch).toHaveBeenCalledTimes(1);
  expect(getApiError(error)).toMatchObject({ kind: "http", status: 503 });
  expect(getApiError(error).message).not.toContain("Private details");
});
