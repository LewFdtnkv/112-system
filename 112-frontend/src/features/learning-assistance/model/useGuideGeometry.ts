import type { LearningHint } from "@/entities/training";
import { useEffect, useState } from "react";
import { guideAnchor } from "../lib/guideAnchor";
import type { GuideGeometry } from "../types/guide";

export function useGuideGeometry(hint: LearningHint) {
  const [geometry, setGeometry] = useState<GuideGeometry | null>(null);
  useEffect(() => {
    let previous: HTMLElement | null = null;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const anchor = guideAnchor(hint);
      if (!anchor) {
        setGeometry(null);
        return;
      }
      if (previous !== anchor.element) {
        previous = anchor.element;
        const rect = previous.getBoundingClientRect();
        if (rect.top < 8 || rect.bottom > window.innerHeight - 8)
          previous.scrollIntoView({
            block: "center",
            inline: "nearest",
            behavior: "instant",
          });
      }
      const bounds = [anchor.element, ...(anchor.include ?? [])].map((el) =>
        el.getBoundingClientRect(),
      );
      const rect = {
        left: Math.min(...bounds.map((b) => b.left)),
        top: Math.min(...bounds.map((b) => b.top)),
        right: Math.max(...bounds.map((b) => b.right)),
        bottom: Math.max(...bounds.map((b) => b.bottom)),
      };
      const left = Math.max(4, rect.left - 5);
      const top = Math.max(4, rect.top - 5);
      const next = {
        left,
        top,
        width: Math.max(
          0,
          Math.min(window.innerWidth - 4, rect.right + 5) - left,
        ),
        height: Math.max(
          0,
          Math.min(window.innerHeight - 4, rect.bottom + 5) - top,
        ),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        host:
          anchor.element.closest<HTMLElement>('[role="dialog"]') ??
          document.body,
        message: anchor.message,
      };
      setGeometry((old) =>
        old &&
        Object.entries(next).every(
          ([key, value]) => old[key as keyof GuideGeometry] === value,
        )
          ? old
          : next,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-expanded", "aria-hidden", "class"],
    });
    const resize = new ResizeObserver(schedule);
    resize.observe(document.body);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    measure();
    return () => {
      observer.disconnect();
      resize.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [hint]);
  return geometry;
}
