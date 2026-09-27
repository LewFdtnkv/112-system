import type { UserItem } from "../types/user";
export const userName = (
  user: Pick<UserItem, "username" | "first_name" | "last_name" | "middle_name">,
) =>
  [user.last_name, user.first_name, user.middle_name]
    .filter(Boolean)
    .join(" ") || user.username;
