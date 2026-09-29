import { UserPhoto } from "./UserPhoto";
import type { UserIdentityProps } from "../types/UserPhoto";
import "../styles/user-identity.scss";

export function UserIdentity({ userId, name }: UserIdentityProps) {
  return (
    <span className="user-identity">
      <UserPhoto userId={userId} size="small" decorative />
      <span className="user-identity__name">{name}</span>
    </span>
  );
}
