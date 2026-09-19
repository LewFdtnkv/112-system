import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it } from "vitest";

import { authStorageKey, useAuthStore } from "@/entities/user";

import { LoginPage } from "./LoginPage";

afterEach(() => {
  cleanup();
  localStorage.clear();
  useAuthStore.getState().clearSession();
});

const renderLogin = (initialPath = "/login") => {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/student" element={<h1>Кабинет ученика</h1>} />
        <Route path="/" element={<h1>Главная</h1>} />
      </Routes>
    </MemoryRouter>,
  );
};

it("validates the form and stores only the demonstration session", async () => {
  const user = userEvent.setup();
  renderLogin();

  await user.click(screen.getByRole("button", { name: "Войти" }));
  expect(await screen.findByText("Укажите электронную почту.")).toBeVisible();
  expect(screen.getByText("Укажите пароль.")).toBeVisible();

  await user.type(
    screen.getByRole("textbox", { name: "Электронная почта" }),
    "student1@example.test",
  );
  await user.type(screen.getByLabelText("Пароль"), "wrong-password");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  expect(
    await screen.findByText("Проверьте электронную почту и пароль."),
  ).toBeVisible();
  expect(localStorage.getItem(authStorageKey)).toBeNull();

  await user.clear(screen.getByLabelText("Пароль"));
  await user.type(screen.getByLabelText("Пароль"), "demo112");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  expect(await screen.findByRole("heading", { name: "Главная" })).toBeVisible();
  expect(useAuthStore.getState().session).toEqual({
    userId: "demo-student-1",
    roles: ["student"],
  });

  const persisted = localStorage.getItem(authStorageKey);
  expect(persisted).toContain("demo-student-1");
  expect(persisted).not.toContain("demo112");
});

it("rejects an unsafe return path and sends the user home", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: "/login",
          state: { from: { pathname: "//untrusted.example" } },
        },
      ]}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<h1>Главная</h1>} />
      </Routes>
    </MemoryRouter>,
  );

  await user.type(
    screen.getByRole("textbox", { name: "Электронная почта" }),
    "student1@example.test",
  );
  await user.type(screen.getByLabelText("Пароль"), "demo112");
  await user.click(screen.getByRole("button", { name: "Войти" }));

  expect(await screen.findByRole("heading", { name: "Главная" })).toBeVisible();
});
