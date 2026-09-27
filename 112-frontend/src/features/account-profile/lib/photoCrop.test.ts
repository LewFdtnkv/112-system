import { describe, expect, it } from "vitest";
import {
  photoBounds,
  initialPhotoPosition,
  clampPhotoOffset,
  validatePhoto,
} from "./photoCrop";

describe("photo framing", () => {
  it("fits both portrait and landscape without cutting the original at the initial scale", () => {
    expect(photoBounds(400, 800, initialPhotoPosition)).toEqual({
      x: 128,
      y: 0,
      width: 256,
      height: 512,
    });
    expect(photoBounds(800, 400, initialPhotoPosition)).toEqual({
      x: 0,
      y: 128,
      width: 512,
      height: 256,
    });
  });
  it("can shrink an image even below fit and place a face away from its original centre", () => {
    expect(photoBounds(512, 512, { zoom: 0.5, x: -20, y: 30 })).toEqual({
      x: 108,
      y: 158,
      width: 256,
      height: 256,
    });
    expect(clampPhotoOffset(900)).toBe(256);
    expect(clampPhotoOffset(-900)).toBe(-256);
  });
  it("rejects unsupported and oversized files before decoding or uploading", () => {
    expect(
      validatePhoto(new File(["image"], "file.svg", { type: "image/svg+xml" })),
    ).toMatch(/PNG или JPEG/);
    expect(
      validatePhoto(
        new File([new Uint8Array(2_000_001)], "file.png", {
          type: "image/png",
        }),
      ),
    ).toMatch(/2 МБ/);
    expect(
      validatePhoto(new File(["image"], "file.png", { type: "image/png" })),
    ).toBeNull();
  });
});
