export type ApiErrorInfo =
  | { kind: "http"; status: number; message: string }
  | { kind: "network" | "timeout" | "aborted" | "unknown"; message: string };

export type ApiFieldError = { path: string; message: string };
