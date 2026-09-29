import type { SxProps, Theme } from "@mui/material";
export const styles = {
  metadata: {
    flexWrap: "wrap",
    gap: 2,
    "& > *": { minWidth: 190, flex: "1 1 190px" },
  } satisfies SxProps<Theme>,
  paper: {
    p: 1,
    mb: 2,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies SxProps<Theme>,
  stack: { alignItems: "center" } satisfies SxProps<Theme>,
  typography: { flex: 1 } satisfies SxProps<Theme>,
};
