import { UserPhoto, userName } from "@/entities/training";
import type { StudentIdentityProps } from "../types/StudentOverviewPanel";
export function StudentIdentity({ user, groups }: StudentIdentityProps) {
  return (
    <section className="student-identity" aria-label="Данные ученика">
      <UserPhoto userId={user.id} />
      <div>
        <h2>{userName(user)}</h2>
        <p>
          {user.username}
          {user.email ? ` · ${user.email}` : ""}
        </p>
        <p>{groups.length ? groups.join(" · ") : "Без учебной группы"}</p>
      </div>
      <span className="student-identity-role">Ученик</span>
    </section>
  );
}
