import { Navigate } from "react-router-dom";

import { useAuthStore } from "@/entities/user";
import { routePaths } from "@/shared/config/routes";
import { LoadingScreen } from "@/shared/ui/LoadingScreen";

export const HomePage = () => {
  const { status, session } = useAuthStore();

  if (status === "checking") return <LoadingScreen />;
  if (!session) return <Navigate replace to={routePaths.login} />;

  const destination = session.roles.includes("admin")
    ? routePaths.adminDashboard
    : session.roles.includes("teacher")
      ? routePaths.teacherDashboard
      : session.roles.includes("student")
        ? routePaths.studentDashboard
        : routePaths.forbidden;

  return <Navigate replace to={destination} />;
};
