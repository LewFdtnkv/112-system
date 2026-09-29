import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { useAuthStore } from "@/entities/user";

import { ProtectedRoute } from "./ProtectedRoute";
import { RoleRoute } from "./RoleRoute";

afterEach(() => {
  cleanup();
  useAuthStore.getState().clearSession();
});

const renderGuard = (allowedRoles?: string[]) => {
  const router = createMemoryRouter(
    [
      {
        element: allowedRoles ? (
          <RoleRoute allowedRoles={allowedRoles} />
        ) : (
          <ProtectedRoute />
        ),
        children: [{ path: "/private", element: <h1>Private content</h1> }],
      },
      { path: "/login", element: <h1>Login</h1> },
      { path: "/403", element: <h1>Forbidden</h1> },
    ],
    { initialEntries: ["/private?tab=current#details"] },
  );

  render(<RouterProvider router={router} />);
  return router;
};

describe("route access", () => {
  it("sends guests to login and preserves the complete return location", async () => {
    const router = renderGuard();

    expect(await screen.findByRole("heading", { name: "Login" })).toBeVisible();
    expect(router.state.historyAction).toBe("REPLACE");
    expect(router.state.location.state.from).toMatchObject({
      pathname: "/private",
      search: "?tab=current",
      hash: "#details",
    });
    expect(screen.queryByText("Private content")).not.toBeInTheDocument();
  });

  it("waits during a session check and renders the route when it succeeds", async () => {
    useAuthStore.getState().startChecking();
    const router = renderGuard();

    expect(screen.getByRole("status")).toBeVisible();
    expect(router.state.location.pathname).toBe("/private");
    expect(screen.queryByText("Private content")).not.toBeInTheDocument();

    act(() =>
      useAuthStore.getState().setSession({ userId: "test-user", roles: [] }),
    );

    expect(await screen.findByText("Private content")).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("removes protected content when the session is cleared", async () => {
    useAuthStore.getState().setSession({ userId: "test-user", roles: [] });
    renderGuard();
    expect(screen.getByText("Private content")).toBeVisible();

    act(() => useAuthStore.getState().clearSession());

    expect(await screen.findByRole("heading", { name: "Login" })).toBeVisible();
    expect(screen.queryByText("Private content")).not.toBeInTheDocument();
  });

  it("checks authentication before checking a role", async () => {
    renderGuard(["test-editor"]);

    expect(await screen.findByRole("heading", { name: "Login" })).toBeVisible();
    expect(screen.queryByText("Forbidden")).not.toBeInTheDocument();
  });

  it.each([{ roles: [] }, { roles: ["test-reader"] }])(
    "rejects a session without an allowed role: $roles",
    async ({ roles }) => {
      useAuthStore.getState().setSession({ userId: "test-user", roles });
      renderGuard(["test-editor"]);

      expect(await screen.findByText("Forbidden")).toBeVisible();
      expect(screen.queryByText("Private content")).not.toBeInTheDocument();
    },
  );

  it("allows a session matching any allowed role", () => {
    useAuthStore.getState().setSession({
      userId: "test-user",
      roles: ["test-reader", "test-editor"],
    });
    renderGuard(["test-editor", "test-owner"]);

    expect(screen.getByText("Private content")).toBeVisible();
  });

  it("denies access when no allowed roles are configured", async () => {
    useAuthStore
      .getState()
      .setSession({ userId: "test-user", roles: ["test-editor"] });
    renderGuard([]);

    expect(await screen.findByText("Forbidden")).toBeVisible();
  });
});
