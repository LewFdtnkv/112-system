import { isHTTPError } from "ky";
import type { ApiFieldError } from "../types/types";

/** A field path and user-facing text are supplied by the API, never inferred from prose. */
export function getStructuredApiFieldErrors(error: unknown): ApiFieldError[] {
  if (!isHTTPError(error)) return [];
  const body = error.data as { field_errors?: unknown } | undefined;
  if (!Array.isArray(body?.field_errors)) return [];
  return body.field_errors.flatMap((issue: unknown) =>
    issue &&
    typeof issue === "object" &&
    "path" in issue &&
    typeof issue.path === "string" &&
    "message" in issue &&
    typeof issue.message === "string"
      ? [{ path: issue.path, message: issue.message }]
      : [],
  );
}
