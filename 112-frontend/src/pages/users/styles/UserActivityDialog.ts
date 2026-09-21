import type { SxProps, Theme } from "@mui/material";
export const styles = {
  stack: {
    borderBottom: "1px solid",
    borderColor: "divider",
    pb: 1,
  } satisfies SxProps<Theme>,
  typography: {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  } satisfies SxProps<Theme>,
};
