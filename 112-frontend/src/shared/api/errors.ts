import { isHTTPError, isNetworkError, isTimeoutError } from "ky";

import type { ApiErrorInfo } from "./types";

const messages: Record<string, string> = {
  "Accept the service response before managing crews":
    "Сначала примите карточку своей службой. Завершённое реагирование менять нельзя.",
  "Complete or cancel active crew assignments first":
    "Сначала завершите работы назначенных бригад или отмените их назначения с комментарием.",
  "Crew must be active in the attempt profile":
    "Бригада недоступна в профиле этого задания.",
  "Crew action requires a message from this attempt":
    "Обновите карточку: для действия нужно сообщение текущего задания.",
  "Invalid crew status transition":
    "Недопустимый переход статуса бригады. Обновите карточку.",
  "Required crews must be active in the selected profile":
    "Выберите доступные бригады выбранного профиля службы.",
  "Value error, Crew contact must belong to this profile":
    "Контакт старшего бригады должен быть добавлен в этот профиль.",
  "Value error, Required crews must not repeat":
    "Бригада не должна повторяться в целях задания.",

  "Unknown classifier feature":
    "В ответах есть признак, которого нет в выбранном правиле ЕКП. Выберите тип происшествия заново.",
  "Catalog label, service or incident code already exists":
    "Название версии или код уже используется. Укажите уникальное название новой версии.",
  "Used cards cannot be edited":
    "Карточка уже включена в сценарий. Доступен только просмотр.",
  "Card has a newer revision. Reload it before saving.":
    "Карточка изменена в другом окне. Загрузите актуальные данные перед сохранением.",
  "Recipients must follow the selected classifier routes":
    "Выбранные службы не соответствуют признакам и маршрутам ЕКП.",
  "Unsupported classifier condition format":
    "Эта версия содержит неподдерживаемый формат условий. Нужен подготовленный JSON system112-ekp-v1.",
  "Value error, DDS scenarios require exercise steps":
    "Для сценария ДДС задайте этапы упражнения.",
  "Value error, DDS steps must follow valid transitions and include source information":
    "Проверьте порядок статусов ДДС и заполните сообщения каждого этапа.",
  "Value error, Expected crew number must be present in the source message":
    "Эталонный номер наряда должен быть указан в сообщении ученику на том же этапе.",
  "Value error, Object territory must belong to this profile":
    "Код территории объекта должен совпадать с кодом территории этого профиля.",
  "Value error, Feature keys must not repeat":
    "Ключи признаков должны быть уникальными.",
  "Value error, Route conditions must reference declared features":
    "В условиях маршрута допустимы только объявленные признаки.",
  "Value error, Service routes must not repeat":
    "Служба не должна повторяться в маршрутах одного правила.",
  "Value error, Service and incident codes must be unique":
    "Коды служб и происшествий должны быть уникальными.",
  "Value error, Every route must reference a service from this file":
    "Все службы маршрутов нужно объявить в services этого файла.",
  "Value error, At least one unconditional route is required":
    "Нужен хотя бы один безусловный получатель.",
  "Value error, Only one main service is allowed":
    "Главной может быть только одна служба.",
  "Input should be a valid boolean": "Укажите true или false без кавычек.",
  "Field required": "Обязательное поле отсутствует.",
  "Extra inputs are not permitted": "Неизвестное поле.",
  "Answer every classifier feature":
    "Ответьте на все уточняющие признаки происшествия.",
  "Profile revision is stale; reload the profile":
    "Профиль изменён в другой вкладке. Откройте актуальную версию.",
  "Catalog revision is stale; reload the catalog":
    "Справочник изменён в другой вкладке. Откройте правило заново.",
  "DDS response revision is stale; reload the card":
    "Реагирование изменено в другой вкладке. Обновите карточку.",
  "Invalid DDS status transition": "Этот переход статуса недоступен.",
  "Read the next scenario message before updating status":
    "Обновите карточку и прочитайте следующее сообщение сценария.",
  "DDS scenario requires configured exercise steps":
    "Преподавателю нужно задать этапы упражнения ДДС в новой версии сценария.",
  "Each DDS card must be addressed to the profile service":
    "Каждая карточка сценария ДДС должна быть адресована службе выбранного профиля.",

  "You cannot disable your own account":
    "Нельзя отключить собственный аккаунт. Это может сделать другой администратор.",
  "A reason is required to change access": "Укажите причину изменения доступа.",
  "The last active administrator must be retained":
    "Нельзя отключить последнего активного администратора.",
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
const translate = (message: string) => {
  for (const [prefix, text] of [
    ["Answer required feature: ", "Заполните обязательный признак: "],
    ["Invalid answer for feature: ", "Проверьте значение признака: "],
  ]) {
    if (message.startsWith(prefix)) return text + message.slice(prefix.length);
  }
  return messages[message];
};
export const getApiError = (error: unknown): ApiErrorInfo => {
  if (isHTTPError(error)) {
    const body = error.data as { detail?: unknown } | undefined;
    const detail = typeof body?.detail === "string" ? body.detail : "";
    const validation = Array.isArray(body?.detail)
      ? body.detail
      : body?.detail &&
          typeof body.detail === "object" &&
          "errors" in body.detail &&
          Array.isArray(body.detail.errors)
        ? body.detail.errors
        : [];
    const validationMessage = validation
      .slice(0, 3)
      .map((e: { loc?: (string | number)[]; msg?: string }) => {
        const location = (e.loc ?? [])
          .filter((part) => part !== "body")
          .join(".");
        return `${location ? `${location}: ` : ""}${messages[e.msg ?? ""] ?? "Проверьте формат и допустимые значения поля."}`;
      })
      .join(" ");
    return {
      kind: "http",
      status: error.response.status,
      message:
        validationMessage ||
        (translate(detail) ??
          (
            {
              413: "JSON-файл превышает допустимый размер 8 МБ.",
              403: "Недостаточно прав для этого действия.",
              404: "Запись не найдена или недоступна.",
              409: "Данные изменились или такая запись уже существует. Обновите список и проверьте введённые значения.",
              422: "Проверьте обязательные поля, допустимые значения и длину текста.",
            } as Record<number, string>
          )[error.response.status] ??
          "Не удалось выполнить запрос. Повторите попытку."),
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
