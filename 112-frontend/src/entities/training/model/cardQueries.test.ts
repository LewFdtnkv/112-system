import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { cardKeys, invalidateCard } from "./cardQueries";

it("invalidates the library, card and DDS scenario selectors together, without unrelated data", async () => {
  const client = new QueryClient();
  const keys = [
    cardKeys.list("", 0),
    cardKeys.detail("card"),
    [...cardKeys.options, "dds", "profile", ""],
    ["users"],
  ];
  keys.forEach((key) => client.setQueryData(key, {}));
  await invalidateCard(client, "card");
  expect(keys.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([
    true,
    true,
    true,
    false,
  ]);
});
