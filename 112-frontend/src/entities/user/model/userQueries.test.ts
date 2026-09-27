import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import {
  invalidateUser,
  invalidateGroupMembers,
  userKeys,
} from "./userQueries";

it("invalidates user projections including groups, assignment choices and telephony", async () => {
  const client = new QueryClient();
  const keys = [
    userKeys.users,
    userKeys.user,
    userKeys.members,
    userKeys.groupStudents,
    userKeys.telephonyStudents,
    userKeys.options,
    ["student-overview"],
    ["lessons"],
  ];
  for (const key of keys)
    client.setQueryData([...key, "cached"], { name: "До изменения" });
  client.setQueryData(["cards"], []);
  await invalidateUser(client);
  for (const key of keys)
    expect(client.getQueryState([...key, "cached"])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["cards"])?.isInvalidated).toBe(false);
  client.clear();
});

it("updates both membership lists and lesson target choices after a transfer", async () => {
  const client = new QueryClient();
  const keys = [
    userKeys.members,
    userKeys.groupStudents,
    userKeys.groups,
    userKeys.groupOptions,
    userKeys.transferGroups,
  ];
  for (const key of keys)
    for (const id of ["old", "new"]) client.setQueryData([...key, id], []);
  await invalidateGroupMembers(client);
  for (const key of keys)
    for (const id of ["old", "new"])
      expect(client.getQueryState([...key, id])?.isInvalidated).toBe(true);
  client.clear();
});
