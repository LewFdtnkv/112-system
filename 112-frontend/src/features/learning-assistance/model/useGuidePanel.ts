import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useGuideGeometry } from "./useGuideGeometry";
import type { GuideSpotlightProps } from "../types/guide";
import { guidePanelStyle } from "../styles/guide";

export function useGuidePanel({
  hint,
  onPause,
}: Pick<GuideSpotlightProps, "hint" | "onPause">) {
  const geometry = useGuideGeometry(hint);
  const panel = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(300);
  useLayoutEffect(() => {
    if (!panel.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setHeight(entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height),
    );
    observer.observe(panel.current);
    return () => observer.disconnect();
  }, [geometry?.host]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onPause();
      }
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [onPause]);
  const w = geometry?.viewportWidth ?? window.innerWidth;
  const h = geometry?.viewportHeight ?? window.innerHeight;
  const width = Math.min(370, w - 24);
  const g = geometry;
  const left = g ? Math.min(w - width - 12, Math.max(12, g.left)) : 12;
  // Prefer below the target, then above, then a free side for tall panels.
  const below = g ? g.top + g.height + 12 : 12;
  const top =
    g && below + height > h - 12 ? Math.max(12, g.top - height - 12) : below;
  const side =
    g && g.height + height + 24 > h
      ? g.left + g.width + width + 24 < w
        ? g.left + g.width + 12
        : g.left > width + 24
          ? g.left - width - 12
          : left
      : left;
  return {
    geometry,
    panel,
    w,
    h,
    g,
    style: guidePanelStyle(
      side,
      Math.min(top, Math.max(12, h - height - 12)),
      width,
      h,
    ),
    host:
      geometry?.host ??
      document.querySelector<HTMLElement>('.arm-card-dialog [role="dialog"]') ??
      document.body,
  };
}
