import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { authStorageKey, useAuthStore } from "@/entities/user";

import { authFetch } from "@/entities/user/model/authFixture";

beforeEach(() => vi.stubGlobal("fetch", vi.fn(authFetch)));

import { LoginPage } from "./LoginPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

it("validates credentials and uses the server profile", async () => {
  const user = userEvent.setup();
  renderLogin();

  await user.click(screen.getByRole("button", { name: "Войти" }));
  expect(await screen.findByText("Укажите логин.")).toBeVisible();
  expect(screen.getByText("Укажите пароль.")).toBeVisible();

  await user.type(screen.getByRole("textbox", { name: "Логин" }), "student");
  await user.type(screen.getByLabelText("Пароль"), "wrong-password");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  expect(
    await screen.findByText("Проверьте логин и пароль или войдите заново."),
  ).toBeVisible();
  expect(localStorage.getItem(authStorageKey)).toBeNull();

  await user.clear(screen.getByLabelText("Пароль"));
  await user.type(screen.getByLabelText("Пароль"), "valid-password");
  await user.click(screen.getByRole("button", { name: "Войти" }));
  expect(await screen.findByRole("heading", { name: "Главная" })).toBeVisible();
  expect(useAuthStore.getState().session).toMatchObject({
    userId: "test-student",
    roles: ["student"],
  });

  const persisted = localStorage.getItem(authStorageKey);
  expect(persisted).toBeNull();
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

  await user.type(screen.getByRole("textbox", { name: "Логин" }), "student");
  await user.type(screen.getByLabelText("Пароль"), "valid-password");
  await user.click(screen.getByRole("button", { name: "Войти" }));

  expect(await screen.findByRole("heading", { name: "Главная" })).toBeVisible();
});
