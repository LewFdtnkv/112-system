export const jobDate = (value: string | null) =>
  value ? new Date(value).toLocaleString("ru-RU") : "—";
