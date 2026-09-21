import type { DemoUser, DemoUserRole } from "../types/demoUsers";

export const userRoleLabels: Record<DemoUserRole, string> = {
  student: "Ученик",
  teacher: "Преподаватель",
  admin: "Администратор",
};

export const demoStudentId = "demo-student-1";
export const demoTeacherId = "demo-teacher-1";

export const demoUsers: DemoUser[] = [
  {
    id: demoStudentId,
    name: "Анна Смирнова",
    email: "student1@example.test",
    role: "student",
    group: "Учебная группа 1",
  },
  {
    id: "demo-student-2",
    name: "Илья Волков",
    email: "student2@example.test",
    role: "student",
    group: "Учебная группа 1",
  },
  {
    id: "demo-student-3",
    name: "Елена Соколова",
    email: "student3@example.test",
    role: "student",
    group: "Учебная группа 2",
  },
  {
    id: demoTeacherId,
    name: "Мария Орлова",
    email: "teacher@example.test",
    role: "teacher",
    group: null,
  },
  {
    id: "demo-admin-1",
    name: "Алексей Кузнецов",
    email: "admin@example.test",
    role: "admin",
    group: null,
  },
];

export type { DemoUser, DemoUserRole } from "../types/demoUsers";
