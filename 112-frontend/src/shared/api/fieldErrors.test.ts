import ky from "ky";
import { expect, it } from "vitest";
import { getApiFieldErrors } from "./fieldErrors";
import { getApiError } from "./errors";

async function apiError(detail: unknown) {
  return ky
    .post("https://test.invalid", {
      retry: 0,
      fetch: async () => Response.json({ detail }, { status: 422 }),
    })
    .catch((e: unknown) => e);
}
it("does not infer field paths or expose unknown diagnostic text", async () => {
  expect(getApiFieldErrors(await apiError("Username already exists"))).toEqual(
    [],
  );
  const unknown = await apiError([
    { loc: ["body"], type: "value_error", msg: "private arbitrary data" },
  ]);
  expect(getApiError(unknown).message).not.toContain("private");
});
it("uses actionable structured domain messages also outside forms", async () => {
  const error = await apiError([
    {
      loc: ["body", "learning", "target_skills"],
      type: "form_constraint",
      msg: "В карточке нет адреса для отработки этого навыка.",
    },
  ]);
  expect(getApiError(error).message).toBe(
    "В карточке нет адреса для отработки этого навыка.",
  );
});
