export const roles = {
  admin: "Администраторы",
  teacher: "Преподаватели",
  student: "Ученики",
} as const;

export const metrics = [
  { key: "registered", label: "Пользователи" },
  { key: "sessions", label: "Действующие сеансы" },
] as const;
