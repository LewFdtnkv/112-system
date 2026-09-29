import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createLocalDraftStore, localDraftKey } from "./localDraft";

const valid = (v: unknown): v is { text: string } =>
  !!v && typeof v === "object" && "text" in v && typeof v.text === "string";
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it("restores a draft only for the same owner and attempt", () => {
  const key = localDraftKey("alice", "card-1");
  createLocalDraftStore(key, valid)
    .getState()
    .save({ text: "Несохранённый ответ" }, 7);
  expect(createLocalDraftStore(key, valid).getState().draft).toMatchObject({
    fields: { text: "Несохранённый ответ" },
    revision: 7,
  });
  for (const other of [
    localDraftKey("bob", "card-1"),
    localDraftKey("alice", "card-2"),
  ])
    expect(createLocalDraftStore(other, valid).getState().draft).toBeNull();
});

it("acknowledging an older request keeps newer text and advances its base revision", () => {
  const store = createLocalDraftStore("in-flight", valid);
  store.getState().save({ text: "Первый текст" }, 3);
  const token = store.getState().draft!.token;
  store.getState().save({ text: "Дополненный текст" }, 3);
  store.getState().acknowledge(token, 4);
  expect(
    createLocalDraftStore("in-flight", valid).getState().draft,
  ).toMatchObject({
    fields: { text: "Дополненный текст" },
    revision: 4,
  });
  store.getState().acknowledge(store.getState().draft!.token, 5);
  expect(createLocalDraftStore("in-flight", valid).getState().draft).toBeNull();
});

it("does not overwrite another tab's local draft", async () => {
  const first = createLocalDraftStore("tabs", valid);
  const second = createLocalDraftStore("tabs", valid);
  first.getState().save({ text: "Первая вкладка" }, 1);
  second.getState().save({ text: "Вторая вкладка" }, 1);
  await Promise.resolve();
  expect(second.getState().storageFailed).toBe(true);
  expect(second.getState().draft?.fields.text).toBe("Вторая вкладка");
  expect(
    createLocalDraftStore("tabs", valid).getState().draft?.fields.text,
  ).toBe("Первая вкладка");
});

it("keeps editing possible and reports storage failure", async () => {
  const store = createLocalDraftStore("quota", valid);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Quota", "QuotaExceededError");
  });
  expect(() => store.getState().save({ text: "Ответ" }, 1)).not.toThrow();
  await Promise.resolve();
  expect(store.getState().storageFailed).toBe(true);
  expect(store.getState().draft?.fields.text).toBe("Ответ");
});

it.each([
  "{broken",
  JSON.stringify({
    version: 1,
    state: { draft: { fields: 42, revision: 1, token: "bad", updatedAt: 1 } },
  }),
])("does not restore damaged browser data: %s", async (raw) => {
  localStorage.setItem("damaged", raw);
  const store = createLocalDraftStore("damaged", valid);
  await Promise.resolve();
  expect(store.getState().draft).toBeNull();
  expect(store.getState().storageFailed).toBe(true);
});
