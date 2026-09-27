export const MAX_UPLOAD_BYTES = 1024 * 1024;
export const UPLOAD_SIZE_MESSAGE = "Файл должен быть не больше 1 МБ.";

export class FileValidationError extends Error {}

export function validateUploadSize(file: Blob) {
  if (file.size > MAX_UPLOAD_BYTES)
    throw new FileValidationError(UPLOAD_SIZE_MESSAGE);
}
