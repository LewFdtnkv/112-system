import { useQueryClient } from "@tanstack/react-query";
import { sessionFromProfile, useAuthStore } from "@/entities/user";
import type { UserDetail } from "@/entities/training";
export function useProfileCache() {
  const client = useQueryClient();
  return (user: UserDetail) => {
    const auth = useAuthStore.getState();
    if (auth.session?.userId === user.id)
      auth.setSession(sessionFromProfile(user));
    for (const key of [
      "users",
      "user",
      "own-profile",
      "student-options",
      "student-overview",
      "admin-summary",
      "lessons",
      "proctoring-monitor",
    ])
      void client.invalidateQueries({ queryKey: [key] });
  };
}
