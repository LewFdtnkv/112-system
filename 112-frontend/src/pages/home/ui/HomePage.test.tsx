import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it } from "vitest";

import { useAuthStore } from "@/entities/user";

import { HomePage } from "./HomePage";

afterEach(() => {
  cleanup();
  useAuthStore.getState().clearSession();
  localStorage.clear();
});

it.each([
  { roles: ["student"], destination: "/student" },
  { roles: ["teacher"], destination: "/teacher" },
  { roles: ["admin"], destination: "/admin" },
  { roles: ["student", "admin"], destination: "/admin" },
  { roles: ["unknown"], destination: "/403" },
  { roles: null, destination: "/login" },
])("opens $destination for roles $roles", ({ roles, destination }) => {
  if (roles) useAuthStore.getState().setSession({ userId: "test-user", roles });

  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path={destination} element={<h1>Ожидаемая страница</h1>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(
    screen.getByRole("heading", { name: "Ожидаемая страница" }),
  ).toBeVisible();
});
