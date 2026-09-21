import type { CSSProperties } from "react";
export const styles = {
  div: (intensity: number): CSSProperties =>
    ({ "--intensity": intensity }) as CSSProperties,
};
