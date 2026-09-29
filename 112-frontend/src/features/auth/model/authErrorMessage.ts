import { getApiError } from "@/shared/api";
export const authErrorMessage = (error: unknown, changingPassword = false) => {
  const info = getApiError(error);
  if (info.kind === "http") {
    if (info.status === 401)
      return "Проверьте логин и пароль или войдите заново.";
    if (info.status === 400 && changingPassword)
      return "Проверьте текущий пароль. Новый пароль должен отличаться от текущего.";
    if (info.status === 422) return "Проверьте формат введённых данных.";
    if (info.status === 429) return "Слишком много попыток. Попробуйте позже.";
    if (info.status >= 500)
      return "Сервер временно недоступен. Попробуйте ещё раз.";
  }
  return info.message;
};
