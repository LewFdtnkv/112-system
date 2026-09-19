import { afterEach, expect, it } from "vitest";
import {
  authStorageKey,
  tokenStorageKey,
  saveTokens,
  useAuthStore,
} from "./authStore";
import { testPair } from "./authFixture";
afterEach(() => {
  useAuthStore.getState().clearSession();
});
it("keeps roles in memory and tokens only for the browser tab", () => {
  saveTokens(testPair);
  useAuthStore.getState().setSession({ userId: "student", roles: ["student"] });
  expect(localStorage.getItem(authStorageKey)).toBeNull();
  expect(sessionStorage.getItem(tokenStorageKey)).toContain("test-refresh");
  expect(sessionStorage.getItem(tokenStorageKey)).not.toContain("roles");
  useAuthStore.getState().clearSession();
  expect(sessionStorage.getItem(tokenStorageKey)).toBeNull();
});
