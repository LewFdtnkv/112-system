import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authApi } from "../api/authApi";
import {
  signIn,
  signOut,
  restoreSession,
  sessionFromProfile,
} from "./authSession";
import { getTokens, saveTokens, useAuthStore } from "./authStore";
import { authFetch, testPair, testProfile } from "./authFixture";
import { backendApi } from "@/shared/api";
beforeEach(() => {
  useAuthStore.getState().clearSession();
  vi.stubGlobal("fetch", vi.fn(authFetch));
});
afterEach(() => {
  useAuthStore.getState().clearSession();
  vi.unstubAllGlobals();
});
it("sends a username, obtains the server profile and revokes the session on logout", async () => {
  let loginBody: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input as Request;
      if (request.url.endsWith("/auth/login"))
        loginBody = await request.clone().json();
      return authFetch(input, init);
    }),
  );
  await signIn({ username: "student", password: "valid-password" });
  expect(useAuthStore.getState().session).toMatchObject({
    userId: testProfile.id,
    roles: ["student"],
    name: "Учебный Иван",
  });
  const requests = vi
    .mocked(fetch)
    .mock.calls.map(([request]) => request as Request);
  expect(loginBody).toEqual({
    username: "student",
    password: "valid-password",
  });
  expect(requests[1].headers.get("Authorization")).toBe("Bearer test-access");
  await signOut();
  expect(useAuthStore.getState().status).toBe("anonymous");
  expect(getTokens()).toBeNull();
});
it("requires a password change without requesting a protected profile", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ ...testPair, must_change_password: true }),
    ),
  );
  await signIn({ username: "new-user", password: "valid-password" });
  expect(useAuthStore.getState().status).toBe("password-required");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("rejects combined roles and preserves exclusive permissions", () => {
  expect(sessionFromProfile({ ...testProfile, is_admin: true }).roles).toEqual([
    "admin",
  ]);
  expect(() =>
    sessionFromProfile({ ...testProfile, is_admin: true, is_teacher: true }),
  ).toThrow("несовместимые роли");
});
it("refreshes concurrent expired requests only once and retries with the rotated token", async () => {
  saveTokens(testPair);
  let refreshes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) => {
      if (request.url.endsWith("/auth/refresh")) {
        refreshes++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return Response.json({
          ...testPair,
          access_token: "rotated",
          refresh_token: "new-refresh",
        });
      }
      return request.headers.get("Authorization") === "Bearer rotated"
        ? Response.json(testProfile)
        : Response.json({}, { status: 401 });
    }),
  );
  await Promise.all([authApi.getCurrentUser(), authApi.getCurrentUser()]);
  expect(refreshes).toBe(1);
  expect(getTokens()?.refresh_token).toBe("new-refresh");
});
it("clears an expired refresh token and never loops on 401", async () => {
  saveTokens(testPair);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({}, { status: 401 })),
  );
  await restoreSession();
  expect(useAuthStore.getState().status).toBe("anonymous");
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("keeps a recoverable session on a server outage", async () => {
  saveTokens(testPair);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({}, { status: 503 })),
  );
  await restoreSession();
  expect(getTokens()).not.toBeNull();
  expect(useAuthStore.getState().initializationError).toBeDefined();
});
it("does not restore a session from an in-flight refresh after logout", async () => {
  saveTokens(testPair);
  let finish!: (value: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) =>
      request.url.endsWith("/auth/refresh")
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Response.json({}, { status: 401 }),
    ),
  );
  const pending = backendApi.get("users/me").catch(() => undefined);
  await vi.waitFor(() => expect(finish).toBeDefined());
  useAuthStore.getState().clearSession();
  finish(Response.json(testPair));
  await pending;
  expect(getTokens()).toBeNull();
  expect(useAuthStore.getState().status).toBe("anonymous");
});
