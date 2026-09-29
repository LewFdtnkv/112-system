import { fieldLabels } from "@/entities/training";

export const kinds: Record<string, string> = {
  "learning.guide_confirmed": "Завершение шага обучения",
  "lesson.paused": "Приостановка занятия",
  "lesson.resumed": "Продолжение занятия",
  "telephony.bound": "Подключение учебного телефона",
  "call.requested": "Начало звонка",
  "call.dialing": "Соединение с абонентом",
  "call.connected": "Начало разговора",
  "call.ended": "Завершение звонка",
  "call.busy": "Абонент занят",
  "call.no_answer": "Абонент не ответил",
  "call.failed": "Ошибка связи",
  "dds.card_opened": "Открытие карточки ДДС",
  "ui.delivery_gap": "Часть истории ввода отсутствует",
  "ui.hint_seen": "Просмотр подсказки",
  "learning.prepared": "Поля вне выбранных навыков подготовлены системой",
  "learning.hint_issued": "Выдана учебная подсказка",
  "dds.card_received": "Получение карточки ДДС",
  "dds.information": "Сообщение по сценарию",
  "dds.status_changed": "Изменение статуса ДДС",
  "dds.crew_changed": "Назначение / статус бригады",
  "dds.submitted": "Сдача упражнения ДДС",
  "attempt.started": "Начало карточки",
  "card.services_changed": "Изменение списка служб",
  "card.draft_saved": "Сохранение черновика",
  "card.notified": "Оповещение служб",
  "command.rejected": "Действие отклонено",
  "assessment.rules_completed": "Автоматическая оценка",
  "assessment.teacher_reviewed": "Пересмотр преподавателем",
  "ui.card_opened": "Открытие формы",
  "ui.card_closed": "Закрытие формы",
  "ui.field_changed": "Изменение поля",
};
export const label = (path: string) =>
  path
    .split(".")
    .filter((part) => part !== "data")
    .map((part) => fieldLabels[part] ?? part)
    .join(" / ");
export const reasons: Record<string, string> = {
  "Card revision is stale; reload the card":
    "Карточка изменена в другой вкладке. Требуется обновить данные",
  "Address and incident description are required":
    "Заполните адрес и сообщение о происшествии",
  "This attempt is no longer editable": "Работа уже завершена",
  "This attempt cannot be submitted": "Эту работу нельзя отправить повторно",
  "Choose an incident code from the assigned classifier":
    "Выберите тип происшествия",
  "Choose a code from the assigned classifier":
    "Выберите тип из справочника задания",
  "Active prepared service routes are required":
    "Для выбранного типа не настроены службы",
  "Conditional routing is not supported by this workflow yet":
    "Условные правила оповещения пока не поддерживаются",
};
export const text = (value: unknown, field = ""): string =>
  value === null || value === undefined || value === ""
    ? "Пусто"
    : field === "classifier_entry_id" || field === "categoryId"
      ? "Тип выбран"
      : typeof value === "boolean"
        ? value
          ? "Да"
          : "Нет"
        : Array.isArray(value)
          ? value.map((item) => text(item)).join(", ")
          : typeof value === "object"
            ? Object.entries(value)
                .map(([key, item]) => `${label(key)}: ${text(item, key)}`)
                .join("; ")
            : String(value);
