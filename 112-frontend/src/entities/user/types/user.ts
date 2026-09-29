export interface UserItem {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  email: string | null;
  is_active: boolean;
  is_admin: boolean;
  is_teacher: boolean;
  must_change_password: boolean;
  groups: string[];
  last_login_at?: string | null;
}

export type UserRole = "student" | "teacher" | "admin";

export interface UserDetail extends Omit<UserItem, "groups"> {
  role: UserRole;
  created_at: string;
  updated_at: string;
  password_changed_at: string | null;
}

export interface UserUpdate {
  reason?: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  email: string | null;
  is_active: boolean;
}

export interface UserCreate {
  username: string;
  initial_password: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  email?: string;
  role: UserRole;
}

export interface GroupItem {
  id: string;
  name: string;
  student_count: number;
}
