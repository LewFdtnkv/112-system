import type { SxProps, Theme } from "@mui/material";
export const styles = {
  stack: { pt: 2 } satisfies SxProps<Theme>,
  stack2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 2,
  } satisfies SxProps<Theme>,
};
