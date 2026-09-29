import { RoleRoute } from "./RoleRoute";

export const AuthenticatedRoute = () => (
  <RoleRoute allowedRoles={["student", "teacher"]} />
);

export const StudentRoute = () => <RoleRoute allowedRoles={["student"]} />;

export const StaffRoute = () => <RoleRoute allowedRoles={["teacher"]} />;

export const AdminRoute = () => <RoleRoute allowedRoles={["admin"]} />;
