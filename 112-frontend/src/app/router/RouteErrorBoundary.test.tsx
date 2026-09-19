import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it } from "vitest";

import { RouteErrorBoundary } from "./RouteErrorBoundary";

afterEach(cleanup);

it.each([
  { status: 403, heading: /^403\./ },
  { status: 404, heading: /^404\./ },
  { status: 503, heading: /^500\./ },
])(
  "renders a recovery page for a route error with status $status",
  async ({ status, heading }) => {
    const router = createMemoryRouter([
      {
        path: "/",
        loader: () => {
          throw new Response("Private server details", { status });
        },
        Component: () => null,
        ErrorBoundary: RouteErrorBoundary,
        HydrateFallback: () => null,
      },
    ]);

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
    expect(screen.getByRole("link", { name: "На главную" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.queryByText("Private server details"),
    ).not.toBeInTheDocument();
  },
);
