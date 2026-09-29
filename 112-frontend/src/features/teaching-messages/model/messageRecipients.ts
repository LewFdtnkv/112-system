import { userApi, userName } from "@/entities/user";

export async function loadMessageStudents(query: string, signal?: AbortSignal) {
  return (
    await userApi.users({ q: query, role: "student", owned_only: true }, signal)
  ).items.map((user) => ({
    id: user.id,
    label: userName(user),
  }));
}

export async function loadMessageGroups(query: string, signal?: AbortSignal) {
  return (await userApi.groups({ q: query }, signal)).items.map((group) => ({
    id: group.id,
    label: group.name,
  }));
}
