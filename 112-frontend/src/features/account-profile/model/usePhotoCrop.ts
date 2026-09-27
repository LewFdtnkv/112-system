import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { getApiError } from "@/shared/api";
import {
  clampPhotoOffset,
  cropPhoto,
  drawPhoto,
  initialPhotoPosition,
  PHOTO_SIZE,
  validatePhoto,
} from "../lib/photoCrop";
import type { PhotoCropDialogProps, PhotoDrag } from "../types/photoCrop";

export function usePhotoCrop({ file, onSave }: PhotoCropDialogProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<PhotoDrag | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [position, setPosition] = useState(initialPhotoPosition);
  const [error, setError] = useState<string | null>(() => validatePhoto(file));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (validatePhoto(file)) return;
    const url = URL.createObjectURL(file);
    const picture = new Image();
    let active = true;
    picture.src = url;
    void picture
      .decode()
      .then(() => {
        if (!active) return;
        if (
          !picture.naturalWidth ||
          picture.naturalWidth * picture.naturalHeight > 16_000_000
        ) {
          setError("Выберите фотографию размером до 16 мегапикселей.");
        } else setImage(picture);
      })
      .catch(() => {
        if (active)
          setError(
            "Не удалось открыть фотографию. Выберите другой PNG или JPEG.",
          );
      });
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    if (canvas.current && image) drawPhoto(canvas.current, image, position);
  }, [image, position]);

  function move(x: number, y: number) {
    setPosition((previous) => ({
      ...previous,
      x: clampPhotoOffset(previous.x + x),
      y: clampPhotoOffset(previous.y + y),
    }));
  }
  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (saving || !image || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }
  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const previous = drag.current;
    if (!previous || previous.pointerId !== event.pointerId || saving) return;
    const scale =
      PHOTO_SIZE / event.currentTarget.getBoundingClientRect().width;
    move(
      (event.clientX - previous.x) * scale,
      (event.clientY - previous.y) * scale,
    );
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }
  function onKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    if (saving || !image) return;
    const delta = event.shiftKey ? 20 : 5;
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-delta, 0],
      ArrowRight: [delta, 0],
      ArrowUp: [0, -delta],
      ArrowDown: [0, delta],
    };
    const direction = directions[event.key];
    if (direction) {
      event.preventDefault();
      move(...direction);
    }
  }
  async function save() {
    if (!image || saving) return;
    setSaving(true);
    setError(null);
    try {
      const photo = await cropPhoto(image, position);
      await onSave(photo);
    } catch (failure) {
      setError(getApiError(failure).message);
    } finally {
      setSaving(false);
    }
  }
  return {
    canvas,
    position,
    image,
    error,
    saving,
    save,
    reset: () => setPosition(initialPhotoPosition),
    zoom: (zoom: number) => setPosition((previous) => ({ ...previous, zoom })),
    onPointerDown,
    onPointerMove,
    onKeyDown,
    endDrag: () => {
      drag.current = null;
    },
  };
}
