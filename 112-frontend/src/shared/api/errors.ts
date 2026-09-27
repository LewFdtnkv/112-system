import { FileValidationError, UPLOAD_SIZE_MESSAGE } from "@/shared/lib/uploads";
import { isHTTPError, isNetworkError, isTimeoutError } from "ky";

import type { ApiErrorInfo } from "./types";

import { getApiFieldErrors } from "./fieldErrors";

export const getApiError = (error: unknown): ApiErrorInfo => {
  if (error instanceof FileValidationError)
    return { kind: "unknown", message: error.message };

  if (isHTTPError(error)) {
    const body = error.data as { message?: unknown } | undefined;
    const message =
      typeof body?.message === "string" ? body.message : undefined;
    const validationMessage = getApiFieldErrors(error)
      .slice(0, 3)
      .map((e) => e.message)
      .join(" ");
    return {
      kind: "http",
      status: error.response.status,
      message:
        validationMessage ||
        (message ??
          (
            {
              413: UPLOAD_SIZE_MESSAGE,
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
