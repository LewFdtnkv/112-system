import { describe, expect, it } from "vitest";
import { getApiError } from "@/shared/api/errors";
import {
  MAX_UPLOAD_BYTES,
  validateUploadSize,
  FileValidationError,
} from "./uploads";

describe("upload limit", () => {
  it("accepts exactly 1 MiB and rejects the next byte with an actionable message", () => {
    expect(() =>
      validateUploadSize(new Blob([new Uint8Array(MAX_UPLOAD_BYTES)])),
    ).not.toThrow();
    expect(() =>
      validateUploadSize(new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 1)])),
    ).toThrow(FileValidationError);
    try {
      validateUploadSize(new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 1)]));
    } catch (error) {
      expect(getApiError(error).message).toBe(
        "Файл должен быть не больше 1 МБ.",
      );
    }
  });
});
