import type { SxProps, Theme } from "@mui/material";
import type { CSSProperties } from "react";
export const styles = {
  details: { marginTop: 16 } satisfies CSSProperties,
  stack: { mt: 1 } satisfies SxProps<Theme>,
  tableCell: {
    maxWidth: 500,
    overflowWrap: "anywhere",
  } satisfies SxProps<Theme>,
};
