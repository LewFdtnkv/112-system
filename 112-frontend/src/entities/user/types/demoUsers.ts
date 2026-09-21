export type DemoUserRole = "student" | "teacher" | "admin";

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: DemoUserRole;
  group: string | null;
}
