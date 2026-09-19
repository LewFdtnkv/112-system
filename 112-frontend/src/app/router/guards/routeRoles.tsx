import { ProtectedRoute } from "./ProtectedRoute";
import { RoleRoute } from "./RoleRoute";

export const AuthenticatedRoute = () => <ProtectedRoute />;

export const StudentRoute = () => <RoleRoute allowedRoles={["student"]} />;

export const StaffRoute = () => (
  <RoleRoute allowedRoles={["teacher", "admin"]} />
);

export const AdminRoute = () => <RoleRoute allowedRoles={["admin"]} />;
