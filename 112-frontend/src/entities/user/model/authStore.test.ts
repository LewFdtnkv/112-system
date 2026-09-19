import { afterEach, expect, it } from "vitest";

import { authStorageKey, useAuthStore } from "./authStore";

afterEach(() => {
  localStorage.clear();
  useAuthStore.getState().clearSession();
});

it("caches and clears only the session", () => {
  useAuthStore
    .getState()
    .setSession({ userId: "demo-student-1", roles: ["student"] });

  expect(localStorage.getItem(authStorageKey)).toBe(
    JSON.stringify({
      state: { session: { userId: "demo-student-1", roles: ["student"] } },
      version: 1,
    }),
  );

  useAuthStore.getState().clearSession();
  expect(localStorage.getItem(authStorageKey)).toBe(
    JSON.stringify({ state: { session: null }, version: 1 }),
  );
});
