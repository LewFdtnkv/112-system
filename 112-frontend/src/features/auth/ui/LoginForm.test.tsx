import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";

afterEach(cleanup);

it.each(["Логин", "Пароль"])(
  "submits once with Enter from %s",
  async (label) => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(<LoginForm onSubmit={submit} />);
    await user.type(screen.getByLabelText("Логин"), "student");
    await user.type(screen.getByLabelText("Пароль"), "password");
    await user.click(screen.getByLabelText(label));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0][0]).toEqual({
      username: "student",
      password: "password",
    });
  },
);

it("validates on Enter and focuses the actual input", async () => {
  const user = userEvent.setup();
  const submit = vi.fn();
  render(<LoginForm onSubmit={submit} />);
  expect(screen.getByLabelText("Логин")).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(await screen.findByText("Укажите логин.")).toBeVisible();
  expect(screen.getByLabelText("Логин")).toHaveFocus();
  expect(submit).not.toHaveBeenCalled();
});

it("does not resubmit while pending or intercept IME confirmation", async () => {
  const user = userEvent.setup();
  let resolve!: () => void;
  const submit = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  render(<LoginForm onSubmit={submit} />);
  await user.type(screen.getByLabelText("Логин"), "student");
  const password = screen.getByLabelText("Пароль");
  await user.type(password, "password");
  fireEvent.keyDown(password, { key: "Enter", isComposing: true });
  expect(submit).not.toHaveBeenCalled();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "Войти" })).toBeDisabled();
  await user.keyboard("{Enter}{Enter}");
  expect(submit).toHaveBeenCalledTimes(1);
  await act(async () => resolve());
  expect(screen.getByRole("button", { name: "Войти" })).toBeEnabled();
});
