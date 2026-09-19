import type { PropsWithChildren } from "react";
import { Navigate, Outlet } from "react-router-dom";

import { useAuthStore } from "@/entities/user";
import { routePaths } from "@/shared/config/routes";

import { ProtectedRoute } from "./ProtectedRoute";

type RoleRouteProps = PropsWithChildren<{ allowedRoles: readonly string[] }>;

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
