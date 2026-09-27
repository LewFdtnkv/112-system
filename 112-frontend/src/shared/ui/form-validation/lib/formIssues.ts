import type { FieldErrors, FieldValues } from "react-hook-form";
import type { FieldIssue } from "../types";

export function formIssues(
  errors: FieldErrors<FieldValues>,
  prefix = "",
): FieldIssue[] {
  return Object.entries(errors).flatMap(([key, error]) => {
    if (
      ["types", "ref"].includes(key) &&
      (typeof errors.type === "string" || typeof errors.message === "string")
    )
      return [];
    if (!error || typeof error !== "object") return [];
    const path = prefix ? `${prefix}.${key}` : key;
    return [
      ...(typeof error.message === "string"
        ? [{ path: path === "root.form" ? "" : path, message: error.message }]
        : []),
      ...formIssues(error as FieldErrors<FieldValues>, path),
    ];
  });
}
