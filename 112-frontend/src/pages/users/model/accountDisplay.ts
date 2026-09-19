import type { UserRole } from "@/entities/training";

export const roleLabels: Record<UserRole, string> = {
  student: "Ученик",
  teacher: "Преподаватель",
  admin: "Администратор",
};
export const accountDate = (date?: string | null) =>
  date
    ? new Date(date).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })
    : "Нет данных";
