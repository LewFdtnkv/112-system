import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { CardComparison } from "./CardComparison";
import type { ReviewedCard } from "../types/comparison";

afterEach(cleanup);

it("opens with discrepancies and allows all fields without hiding unchecked work", async () => {
  const row: ReviewedCard = {
    assignment_id: "a",
    position: 1,
    source_snapshot: null,
    attempt: null,
    automatic_check: {
      method: "rules",
      matched: 1,
      missing: 0,
      different: 1,
      needs_review: 0,
      earned_points: 1,
      possible_points: 2,
      score_percent: 50,
      fields: [
        {
          field: "caller_name",
          label: "ФИО заявителя",
          expected: "Пётр",
          actual: "Пётр",
          status: "matched",
          scored: true,
        },
        {
          field: "address_details.house",
          label: "Дом",
          expected: "12",
          actual: "21",
          status: "different",
          scored: true,
        },
      ],
    },
  };
  const { rerender } = render(<CardComparison row={row} />);
  expect(screen.queryByText("ФИО заявителя")).not.toBeInTheDocument();
  expect(screen.getByText("Дом")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Показать все поля" }),
  );
  expect(screen.getByText("ФИО заявителя")).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: "Только расхождения и проверка" }),
  );
  rerender(
    <CardComparison
      row={{
        ...row,
        automatic_check: null,
        source_snapshot: {
          title: "Ещё не проверено",
          caller_message: "Условие",
          data: { caller_name: "Пётр", additional_fields: {} },
        },
      }}
    />,
  );
  expect(screen.getByText("Пётр")).toBeVisible();
});
