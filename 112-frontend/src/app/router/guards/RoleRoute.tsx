import { Navigate, Outlet } from "react-router-dom";
import type { RoleRouteProps } from "../../types/RoleRoute";

import { useAuthStore } from "@/entities/user";
import { routePaths } from "@/shared/config/routes";

import { ProtectedRoute } from "./ProtectedRoute";

export const RoleRoute = ({ allowedRoles, children }: RoleRouteProps) => {
  const session = useAuthStore((state) => state.session);
  const isAllowed = session?.roles.some((role) => allowedRoles.includes(role));

  return (
    <ProtectedRoute>
      {isAllowed ? (
        (children ?? <Outlet />)
      ) : (
        <Navigate to={routePaths.forbidden} replace />
      )}
    </ProtectedRoute>
  );
};
