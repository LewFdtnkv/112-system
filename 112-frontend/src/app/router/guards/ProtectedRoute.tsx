import type { PropsWithChildren } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuthStore } from "@/entities/user";
import { routePaths } from "@/shared/config/routes";
import { LoadingScreen } from "@/shared/ui/LoadingScreen";

export const ProtectedRoute = ({ children }: PropsWithChildren) => {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();

  if (status === "checking") return <LoadingScreen />;

  if (status === "anonymous") {
    return (
      <Navigate to={routePaths.login} replace state={{ from: location }} />
    );
  }

  return children ?? <Outlet />;
};
