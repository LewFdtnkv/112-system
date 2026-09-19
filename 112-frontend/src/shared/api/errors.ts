import { isHTTPError, isNetworkError, isTimeoutError } from "ky";

import type { ApiErrorInfo } from "./types";

export const getApiError = (error: unknown): ApiErrorInfo => {
  if (isHTTPError(error)) {
    return {
      kind: "http",
      status: error.response.status,
      message: "Не удалось выполнить запрос.",
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
