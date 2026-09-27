import { userApi, invalidateUser } from "@/entities/user";
import { useAuthStore } from "@/entities/user";
import { routePaths } from "@/shared/config/routes";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

export function useResetUserPassword(userId: string) {
  const client = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    gcTime: 0,
    mutationFn: (password: string) => userApi.resetPassword(userId, password),
    onSuccess: () => {
      if (useAuthStore.getState().session?.userId === userId) {
        useAuthStore.getState().clearSession();
        navigate(routePaths.login, { replace: true });
        return;
      }
      void invalidateUser(client);
    },
  });
}
