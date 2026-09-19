import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { LocationMap } from "./LocationMapPlaceholder";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("shows a geocoded point for a completed street address", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          lat: "55.7522",
          lon: "37.6156",
          display_name: "Красная площадь, Москва",
        },
      ],
    }),
  );
  render(<LocationMap addressLine="Красная площадь, д. 1" />);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });

  expect(screen.getByRole("status")).toHaveTextContent(
    "Найдена точка: Красная площадь, Москва",
  );
  expect(screen.getByTitle("Карта: Красная площадь, Москва")).toHaveAttribute(
    "src",
    expect.stringContaining("marker=55.7522%2C37.6156"),
  );
});

it("keeps the map in its default position until an address is specified", () => {
  render(<LocationMap addressLine="" />);

  expect(screen.getByRole("status")).toHaveTextContent(
    "Укажите улицу и дом, чтобы поставить метку.",
  );
  expect(screen.getByTitle("Карта Москвы")).toBeVisible();
});
