import { useQueryClient } from "@tanstack/react-query";
import {
  sessionFromProfile,
  useAuthStore,
  invalidateUser,
} from "@/entities/user";
import type { UserDetail } from "@/entities/user";
export function useProfileCache() {
  const client = useQueryClient();
  return (user: UserDetail) => {
    const auth = useAuthStore.getState();
    if (auth.session?.userId === user.id)
      auth.setSession(sessionFromProfile(user));
    void invalidateUser(client);
  };
}
