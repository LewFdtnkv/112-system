import { isHTTPError, isNetworkError, isTimeoutError } from "ky";

import type { ApiErrorInfo } from "./types";

const messages: Record<string, string> = {
  "You cannot disable or demote your own account":
    "Нельзя отключить собственный аккаунт или изменить его роль. Это может сделать другой администратор.",
  "The last active administrator must be retained":
    "Нельзя отключить или сменить роль последнего активного администратора.",
  "Card revision is stale; reload the card":
    "Карточка изменена в другой вкладке. Ваш ввод сохранён в форме. Закройте её и откройте актуальную карточку перед повторным сохранением.",
  "Evaluation revision is stale; reload the result":
    "Оценка уже изменена. Загрузите актуальную оценку перед сохранением новой редакции.",
  "Address and incident description are required":
    "Заполните адрес и сообщение о происшествии.",
  "Choose an incident code from the assigned classifier":
    "Выберите тип происшествия из назначенной версии ЕКП.",
  "Choose a code from the assigned classifier":
    "Выберите тип происшествия из назначенной версии ЕКП.",
  "Conditional routing is not supported by this workflow yet":
    "Этот тип содержит условные маршруты. Их выполнение пока недоступно; обратитесь к преподавателю.",
  "Active prepared service routes are required":
    "Для этого типа нет подготовленных действующих маршрутов. Обратитесь к преподавателю.",
  "All cards must use the same classifier version":
    "Все карточки сценария должны использовать одну версию ЕКП.",
  "A published classifier version is required":
    "Нужна опубликованная версия ЕКП.",
  "This attempt is no longer editable":
    "Карточка уже сдана или занятие недоступно для редактирования. Обновите журнал.",
  "The student must submit every card before grading":
    "Ученик должен сдать все карточки перед оцениванием.",
  "Complete the previous card first": "Сначала завершите предыдущую карточку.",
  "Lesson is not active": "Занятие уже не активно. Обновите список занятий.",
  "Service code already exists": "Служба с таким кодом уже существует.",
  "Classifier label already exists":
    "Версия ЕКП с таким названием уже существует.",
  "Group members must be active student accounts":
    "В группу можно добавить только активного ученика.",
};
export const getApiError = (error: unknown): ApiErrorInfo => {
  if (isHTTPError(error)) {
    const body = error.data as { detail?: unknown } | undefined;
    const detail = typeof body?.detail === "string" ? body.detail : "";
    return {
      kind: "http",
      status: error.response.status,
      message:
        messages[detail] ??
        (
          {
            403: "Недостаточно прав для этого действия.",
            404: "Запись не найдена или недоступна.",
            409: "Данные изменились или такая запись уже существует. Обновите список и проверьте введённые значения.",
            422: "Проверьте обязательные поля, допустимые значения и длину текста.",
          } as Record<number, string>
        )[error.response.status] ??
        "Не удалось выполнить запрос. Повторите попытку.",
    };
  }

  if (isNetworkError(error)) {
    return { kind: "network", message: "Не удалось установить соединение." };
  }

  if (isTimeoutError(error)) {
    return { kind: "timeout", message: "Превышено время ожидания ответа." };
  }

  if (error instanceof Error && error.name === "AbortError") {
    return { kind: "aborted", message: "Запрос отменён." };
  }

  return { kind: "unknown", message: "Произошла непредвиденная ошибка." };
};
