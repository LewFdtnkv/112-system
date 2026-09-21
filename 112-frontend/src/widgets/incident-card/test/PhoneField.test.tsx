import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { PhoneField } from "../ui/PhoneField";

afterEach(cleanup);

function Harness({
  initial = "",
  disabled = false,
}: {
  initial?: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <PhoneField
        label="Предоставленный"
        value={value}
        onValueChange={setValue}
        disabled={disabled}
      />
      <button>другое поле</button>
      <span data-testid="stored">{value}</span>
    </>
  );
}

const field = () =>
  screen.getByLabelText("Предоставленный") as HTMLInputElement;
const stored = () => screen.getByTestId("stored").textContent;

describe("PhoneField", () => {
  it("настроен как телефонное поле и не подставляет номер оператора", () => {
    render(<Harness />);
    expect(field()).toHaveAttribute("type", "tel");
    expect(field()).toHaveAttribute("autocomplete", "off");
  });

  it("форматирует ввод и хранит то же значение, что видит пользователь", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "89001234567");
    expect(field()).toHaveValue("+7 900 123-45-67");
    expect(stored()).toBe("+7 900 123-45-67");
  });

  it("принимает вставку номера в произвольном формате", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(field());
    await user.paste("8 (900) 123-45-67");
    expect(field()).toHaveValue("+7 900 123-45-67");
  });

  it("не сдвигает курсор при вводе недопустимого символа", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "9001234567");
    field().setSelectionRange(4, 4);
    await user.keyboard("x");
    expect(field()).toHaveValue("+7 900 123-45-67");
    expect(field().selectionStart).toBe(4);
  });

  it("Backspace по дефису удаляет цифру и ставит курсор на её место", async () => {
    const user = userEvent.setup();
    render(<Harness initial="+7 900 123-45-67" />);
    field().focus();
    field().setSelectionRange(11, 11); // сразу после «123-»
    await user.keyboard("{Backspace}");
    expect(field()).toHaveValue("+7 900 124-56-7");
    expect(field().selectionStart).toBe(9);
  });

  it("не ругается на неполный номер, пока поле в фокусе", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "900");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(field()).not.toHaveAttribute("aria-invalid");
  });

  it("показывает причину после ухода из поля и связывает её с полем", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "900");
    await user.tab();
    const hint = screen.getByRole("status");
    expect(hint).toHaveTextContent("Неполный номер: не хватает 7 цифр");
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(field()).toHaveAttribute("aria-describedby", hint.id);
  });

  it("убирает ошибку, как только номер дописан", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "900");
    await user.tab();
    expect(screen.getByRole("status")).toBeInTheDocument();
    await user.click(field());
    await user.keyboard("1234567");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(field()).not.toHaveAttribute("aria-invalid");
  });

  it("не оставляет в данных одинокий «+»", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(field(), "+");
    expect(stored()).toBe("+");
    await user.tab();
    expect(stored()).toBe("");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("не считает пустое поле ошибкой", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(field());
    await user.tab();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("не показывает ошибку в режиме просмотра работы", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);
    await user.type(field(), "900");
    await user.tab();
    expect(screen.getByRole("status")).toBeInTheDocument();
    rerender(<Harness disabled />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(field()).not.toHaveAttribute("aria-invalid");
  });

  it("не переписывает значение, пришедшее с сервера, пока его не правят", () => {
    render(<Harness initial="89001234567" />);
    expect(field()).toHaveValue("89001234567");
  });
});
