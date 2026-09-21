import type { CSSProperties } from "react";
export const styles = {
  div: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 12,
  } satisfies CSSProperties,
};
