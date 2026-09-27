import type { SxProps, Theme } from "@mui/material";
import type { CSSProperties } from "react";
export const styles = {
  badges: { flexWrap: "wrap" } satisfies SxProps<Theme>,
  paper: (compact: boolean): SxProps<Theme> => ({ p: compact ? 1 : 2 }),
  summary: { cursor: "pointer", userSelect: "none" } satisfies CSSProperties,
  typography: { whiteSpace: "pre-wrap" } satisfies SxProps<Theme>,
};
