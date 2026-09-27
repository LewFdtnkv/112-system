import { expect, it } from "vitest";
import type { FieldErrors } from "react-hook-form";
import { formIssues } from "./formIssues";

it("collects parent and child errors without traversing RHF refs or criteria metadata", () => {
  const ref = { message: "Not a field" } as Record<string, unknown>;
  ref.ref = ref;
  const errors = {
    data: {
      message: "Общая ошибка",
      type: "server",
      ref,
      types: { rule: "Not a field" },
      features: {
        first: { type: "required", message: "Первый" },
        second: { type: "required", message: "Второй" },
      },
    },
    root: { form: { type: "server", message: "Ошибка формы" } },
  };
  expect(formIssues(errors as unknown as FieldErrors)).toEqual([
    { path: "data", message: "Общая ошибка" },
    { path: "data.features.first", message: "Первый" },
    { path: "data.features.second", message: "Второй" },
    { path: "", message: "Ошибка формы" },
  ]);
});

it("allows actual fields named message and type", () => {
  expect(
    formIssues({
      message: { type: "required", message: "Сообщение" },
      type: { type: "required", message: "Тип" },
    }),
  ).toEqual([
    { path: "message", message: "Сообщение" },
    { path: "type", message: "Тип" },
  ]);
});
