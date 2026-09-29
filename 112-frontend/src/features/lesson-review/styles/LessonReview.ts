import type { SxProps, Theme } from "@mui/material";
import type { CSSProperties } from "react";
export const styles = {
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 1,
  } satisfies SxProps<Theme>,
  paper: { p: 2 } satisfies SxProps<Theme>,
  p: { whiteSpace: "pre-wrap" } satisfies CSSProperties,
  paper2: { p: 2 } satisfies SxProps<Theme>,
};
