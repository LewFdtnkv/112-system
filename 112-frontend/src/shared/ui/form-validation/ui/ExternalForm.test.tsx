import { useForm } from "react-hook-form";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ValidatedForm } from "./ValidatedForm";
import { ValidatedTextField } from "./ValidatedTextField";

afterEach(cleanup);
it("uses the provided RHF values and rules and submits only once", async () => {
  const submit = vi.fn();
  function Form() {
    const form = useForm<{ value: string }>({
      defaultValues: { value: "bad" },
    });
    const { ref, ...field } = form.register("value", {
      validate: (value) => value === "good" || "Исправьте значение.",
    });
    return (
      <ValidatedForm form={form} onValid={submit}>
        <ValidatedTextField label="Значение" {...field} inputRef={ref} />
        <button type="submit">Сохранить</button>
      </ValidatedForm>
    );
  }
  render(<Form />);
  await act(async () => {
    fireEvent.click(screen.getByText("Сохранить"));
  });
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain(
    "Исправьте значение.",
  );
  fireEvent.change(screen.getByLabelText("Значение"), {
    target: { value: "good" },
  });
  await act(async () => {
    fireEvent.click(screen.getByText("Сохранить"));
  });
  expect(submit).toHaveBeenCalledOnce();
  expect(submit.mock.calls[0][0]).toEqual({ value: "good" });
});
