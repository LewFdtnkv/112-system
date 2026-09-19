import { useEffect, type PropsWithChildren } from "react";
import { Alert, Button, Stack } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { restoreSession, useAuthStore } from "@/entities/user";
import { LoadingScreen } from "@/shared/ui/LoadingScreen";

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const status = useAuthStore((state) => state.status);
  const error = useAuthStore((state) => state.initializationError);
  const queryClient = useQueryClient();
  useEffect(() => {
    const unsubscribe = useAuthStore.subscribe((state, previous) => {
      if (state.session?.userId !== previous.session?.userId)
        queryClient.clear();
    });
    void restoreSession();
    return unsubscribe;
  }, [queryClient]);
  if (error)
    return (
      <Stack spacing={2} sx={{ p: 3 }}>
        <Alert severity="error">Не удалось проверить сеанс. {error}</Alert>
        <Button onClick={() => void restoreSession()}>Повторить</Button>
        <Button onClick={() => useAuthStore.getState().clearSession()}>
          Вернуться ко входу
        </Button>
      </Stack>
    );
  if (status === "checking") return <LoadingScreen />;
  return children;
};
