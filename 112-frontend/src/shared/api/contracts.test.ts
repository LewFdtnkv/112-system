import { afterEach, expect, it, vi } from "vitest";
import { trainingApi } from "@/entities/training";
afterEach(() => vi.unstubAllGlobals());
it("uses server page search and encodes identifiers", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ items: [], total: 0, limit: 20, offset: 0 }),
  );
  vi.stubGlobal("fetch", fetch);
  await trainingApi.lessons(true, { q: "пожар", offset: 20 });
  const request = fetch.mock.calls[0][0] as Request;
  expect(new URL(request.url).pathname).toBe("/api/views/student/lessons");
  expect(new URL(request.url).searchParams.get("q")).toBe("пожар");
  await trainingApi.attempt("id /?");
  expect((fetch.mock.calls[1][0] as Request).url).toContain(
    "student/attempts/id%20%2F%3F",
  );
});
it("sends server revisions and separate notification requests", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({}));
  vi.stubGlobal("fetch", fetch);
  await trainingApi.saveDraft("attempt", 7, "entry", {
    description: "Слова ученика",
    additional_fields: {},
  });
  const req = fetch.mock.calls[0][0] as Request;
  expect(req.method).toBe("PUT");
  expect(await req.json()).toEqual({
    revision: 7,
    classifier_entry_id: "entry",
    data: { description: "Слова ученика", additional_fields: {} },
  });
  await trainingApi.submit("attempt", 8);
  expect(await (fetch.mock.calls[1][0] as Request).json()).toEqual({
    revision: 8,
  });
});
