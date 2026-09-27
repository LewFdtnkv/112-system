import ky from "ky";
import { expect, it } from "vitest";
import cases from "./errorContract.fixture.json";
import { getApiFieldErrors } from "./fieldErrors";

it.each(cases)(
  "preserves the same field and explanation for $body.detail",
  async ({ body, expected }) => {
    const error = await ky
      .post("https://test.invalid", {
        retry: 0,
        fetch: async () => Response.json(body, { status: 422 }),
      })
      .catch((error: unknown) => error);
    expect(getApiFieldErrors(error)).toEqual(expected);
  },
);
