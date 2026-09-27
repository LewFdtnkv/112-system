import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { DDSReactionClock } from "./DDSReactionClock";

afterEach(cleanup);
it.each([
  [30, false],
  [31, true],
])(
  "marks the reaction at %s seconds according to the server deadline",
  (elapsed, late) => {
    render(
      <DDSReactionClock
        elapsed={elapsed}
        norm={30}
        responded={false}
        completed={false}
      />,
    );
    expect(
      screen
        .getByLabelText("Таймер первой реакции")
        .classList.contains("is-overdue"),
    ).toBe(late);
  },
);
it("does not report a breach when a legacy card has no norm", () => {
  render(
    <DDSReactionClock
      elapsed={200}
      norm={null}
      responded={false}
      completed={false}
    />,
  );
  expect(screen.queryByText("Норматив нарушен")).toBeNull();
});
it("distinguishes completion without a response from successful reaction", () => {
  render(
    <DDSReactionClock elapsed={10} norm={30} responded={false} completed />,
  );
  expect(screen.getByText("Статус не введён")).toBeTruthy();
  expect(screen.getByText("Норматив нарушен")).toBeTruthy();
});
