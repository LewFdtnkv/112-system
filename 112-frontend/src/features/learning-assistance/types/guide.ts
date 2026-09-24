import type { LearningHint } from "@/entities/training";

export interface GuideAnchor {
  element: HTMLElement;
  include?: HTMLElement[];
  message?: string;
}
export interface GuideGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  host: HTMLElement;
  message?: string;
}
export interface GuideSpotlightProps {
  hint: LearningHint;
  hideCheck?: boolean;
  busy: boolean;
  error: string | null;
  onCheck: () => void;
  onPause: () => void;
}

export interface JournalGuideProps {
  mode: "start" | "new" | "resume" | "waiting";
}
