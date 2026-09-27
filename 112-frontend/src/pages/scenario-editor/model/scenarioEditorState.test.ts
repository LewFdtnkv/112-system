import { expect, it } from "vitest";
import {
  scenarioEditorInitial,
  scenarioEditorReducer,
} from "./scenarioEditorState";

it("preserves schedule slots when reordering and resets the first arrival when removing", () => {
  let state = scenarioEditorInitial();
  for (const id of ["first", "second", "third"]) {
    state = scenarioEditorReducer(state, {
      type: "add",
      card: { id, label: id },
    });
  }
  state = scenarioEditorReducer(state, { type: "delay", index: 1, value: 90 });
  state = scenarioEditorReducer(state, { type: "move", index: 0, step: 1 });
  expect(state.rows.map((row) => row.card.id)).toEqual([
    "second",
    "first",
    "third",
  ]);
  expect(state.rows.map((row) => row.delay)).toEqual([0, 90, 60]);
  state = scenarioEditorReducer(state, { type: "remove", index: 0 });
  expect(state.rows.map((row) => row.card.id)).toEqual(["first", "third"]);
  expect(state.rows.map((row) => row.delay)).toEqual([0, 60]);
});

it("allows deliberate repeats but caps the scenario at 100 cards", () => {
  let state = scenarioEditorInitial();
  const add = { type: "add" as const, card: { id: "card", label: "Пожар" } };
  for (let i = 0; i < 100; i++) state = scenarioEditorReducer(state, add);
  expect(state.rows).toHaveLength(100);
  expect(state.rows[0].delay).toBe(0);
  expect(state.rows[99].delay).toBe(60);
  expect(scenarioEditorReducer(state, add)).toBe(state);
});
