export function ddsTime(value?: string, full = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    ...(full
      ? ({
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          second: "2-digit",
        } as const)
      : {}),
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(value))
    .replace(",", "");
}
