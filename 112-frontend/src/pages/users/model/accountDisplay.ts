export { userRoleLabels as roleLabels } from "@/entities/user";
export const accountDate = (date?: string | null) =>
  date
    ? new Date(date).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })
    : "Нет данных";
