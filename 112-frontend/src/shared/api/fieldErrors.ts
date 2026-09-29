import { getStructuredApiFieldErrors } from "./structuredFieldErrors";
import { isHTTPError } from "ky";
import type { ApiFieldError } from "../types/types";

export function getApiFieldErrors(error: unknown): ApiFieldError[] {
  if (!isHTTPError(error)) return [];
  const detail = (error.data as { detail?: unknown } | undefined)?.detail;
  const structured = getStructuredApiFieldErrors(error);
  if (structured.length) return structured;
  const rows = Array.isArray(detail)
    ? detail
    : detail &&
        typeof detail === "object" &&
        "errors" in detail &&
        Array.isArray(detail.errors)
      ? detail.errors
      : [];
  return rows.flatMap((row: { loc?: unknown; msg?: string; type?: string }) => {
    if (!row || typeof row !== "object" || !Array.isArray(row.loc)) return [];
    const path = row.loc
      .filter(
        (p) => p !== "body" && (typeof p === "string" || typeof p === "number"),
      )
      .join(".");
    const messages: Record<string, string> = {
      missing: "Заполните это поле.",
      string_too_short: "Значение слишком короткое. Дополните поле.",
      string_too_long: "Сократите значение поля.",
      string_pattern_mismatch: "Проверьте формат значения.",
      int_parsing: "Введите целое число.",
      int_type: "Введите целое число.",
      finite_number: "Введите конечное число.",
      greater_than_equal: "Значение меньше допустимого.",
      greater_than: "Значение должно быть больше допустимой границы.",
      less_than_equal: "Значение больше допустимого.",
      too_short: "Добавьте хотя бы один элемент.",
      uuid_parsing: "Выберите значение из списка.",
    };
    return [
      {
        path,
        message:
          [
            "generation_constraint",
            "card_constraint",
            "form_constraint",
          ].includes(row.type ?? "") && typeof row.msg === "string"
            ? row.msg
            : (messages[row.type ?? ""] ?? "Проверьте значение этого поля."),
      },
    ];
  });
}
