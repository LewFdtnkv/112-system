import { afterEach, expect, it } from "vitest";
import {
  tokenStorageKey,
  saveTokens,
  useAuthStore,
  getTokens,
  getAuthGeneration,
} from "./authStore";
import { testPair } from "./authFixture";
afterEach(() => {
  useAuthStore.getState().clearSession();
});

it("restores tab tokens through persist", async () => {
  saveTokens(testPair);
  await useAuthStore.persist.rehydrate();
  expect(getTokens()).toEqual(testPair);
  expect(useAuthStore.getState().status).toBe("checking");
  expect(useAuthStore.getState().session).toBeNull();
  saveTokens({ ...testPair, access_token: "rotated" });
  const stored = JSON.parse(sessionStorage.getItem(tokenStorageKey)!);
  expect(stored.state).toEqual({
    tokens: { ...testPair, access_token: "rotated" },
  });
});

it("ignores persisted status, roles and generation and rejects malformed tokens", async () => {
  const generation = getAuthGeneration();
  sessionStorage.setItem(
    tokenStorageKey,
    JSON.stringify({
      state: {
        tokens: testPair,
        status: "authenticated",
        session: { userId: "admin", roles: ["admin"] },
        generation: -1,
      },
      version: 0,
    }),
  );
  await useAuthStore.persist.rehydrate();
  expect(useAuthStore.getState().session).toBeNull();
  expect(useAuthStore.getState().status).toBe("checking");
  expect(getAuthGeneration()).toBe(generation);
  sessionStorage.setItem(
    tokenStorageKey,
    JSON.stringify({ state: { tokens: { access_token: 12 } }, version: 0 }),
  );
  await useAuthStore.persist.rehydrate();
  expect(getTokens()).toBeNull();
  expect(useAuthStore.getState().status).toBe("anonymous");
});
it("keeps roles in memory and tokens only for the browser tab", () => {
  saveTokens(testPair);
  useAuthStore.getState().setSession({ userId: "student", roles: ["student"] });
  expect(localStorage.getItem(tokenStorageKey)).toBeNull();
  expect(sessionStorage.getItem(tokenStorageKey)).toContain("test-refresh");
  expect(sessionStorage.getItem(tokenStorageKey)).not.toContain("roles");
  useAuthStore.getState().clearSession();
  expect(sessionStorage.getItem(tokenStorageKey)).toBeNull();
});
