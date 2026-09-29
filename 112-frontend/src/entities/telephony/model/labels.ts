export const stationModeLabels = {
  external: "Внешняя АТС · телефон",
  browser: "Asterisk · браузер",
  phone: "Asterisk · телефон",
};
export const callStatusLabels: Record<string, string> = {
  dialing: "Соединение",
  connected: "Разговор",
  ended: "Завершён",
  busy: "Занято",
  no_answer: "Нет ответа",
  failed: "Ошибка связи",
};
export const audioStatusLabels: Record<string, string> = {
  queued: "Ожидает записи",
  preparing: "Генерируется",
  ready: "Готова",
  failed: "Ошибка подготовки",
};
