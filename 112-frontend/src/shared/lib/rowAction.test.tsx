import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { rowAction } from "./rowAction";

it("activates the whole row by mouse and keyboard without hijacking nested controls", () => {
  const open = vi.fn(),
    nested = vi.fn();
  render(
    <table>
      <tbody>
        <tr {...rowAction(open)} aria-label="Карточка">
          <td>Адрес</td>
          <td>
            <button onClick={nested}>Изменить</button>
            <input aria-label="Значение" />
          </td>
        </tr>
      </tbody>
    </table>,
  );
  const row = screen.getByRole("row");
  fireEvent.click(screen.getByText("Адрес"));
  fireEvent.keyDown(row, { key: "Enter" });
  fireEvent.keyDown(row, { key: " " });
  expect(open).toHaveBeenCalledTimes(3);
  fireEvent.click(screen.getByRole("button"));
  fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
  fireEvent.click(screen.getByRole("textbox"));
  fireEvent.click(row, { ctrlKey: true });
  fireEvent.keyDown(row, { key: "Enter", repeat: true });
  expect(nested).toHaveBeenCalledOnce();
  expect(open).toHaveBeenCalledTimes(3);
});
