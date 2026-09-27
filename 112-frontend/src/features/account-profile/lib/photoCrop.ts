import { MAX_UPLOAD_BYTES, UPLOAD_SIZE_MESSAGE } from "@/shared/lib/uploads";
import type { PhotoPosition } from "../types/photoCrop";

export const PHOTO_SIZE = 512;
export const initialPhotoPosition: PhotoPosition = { x: 0, y: 0, zoom: 1 };
export const clampPhotoOffset = (offset: number) =>
  Math.max(-PHOTO_SIZE / 2, Math.min(PHOTO_SIZE / 2, offset));

export function photoBounds(
  width: number,
  height: number,
  position: PhotoPosition,
) {
  const scale =
    Math.min(PHOTO_SIZE / width, PHOTO_SIZE / height) * position.zoom;
  return {
    x: (PHOTO_SIZE - width * scale) / 2 + position.x,
    y: (PHOTO_SIZE - height * scale) / 2 + position.y,
    width: width * scale,
    height: height * scale,
  };
}

export function drawPhoto(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  position: PhotoPosition,
) {
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error(
      "Не удалось подготовить фотографию. Попробуйте другой браузер.",
    );
  const bounds = photoBounds(image.naturalWidth, image.naturalHeight, position);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height);
}

export async function cropPhoto(
  image: HTMLImageElement,
  position: PhotoPosition,
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PHOTO_SIZE;
  drawPhoto(canvas, image, position);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(
              new Error(
                "Не удалось подготовить фотографию. Попробуйте ещё раз.",
              ),
            ),
      "image/jpeg",
      0.92,
    ),
  );
  return new File([blob], "avatar.jpg", { type: "image/jpeg" });
}

export function validatePhoto(file: File) {
  if (!["image/png", "image/jpeg"].includes(file.type))
    return "Выберите фотографию в формате PNG или JPEG.";
  if (file.size > MAX_UPLOAD_BYTES) return UPLOAD_SIZE_MESSAGE;
  return null;
}
