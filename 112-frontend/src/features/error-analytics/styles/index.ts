import type { SxProps, Theme } from "@mui/material";

export const styles = {
  heading: { fontWeight: 600 },
  filters: {
    display: "grid",
    gridTemplateColumns: { xs: "1fr", md: "2fr 1fr 1fr" },
    gap: 2,
  },
  metrics: {
    display: "grid",
    gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
    gap: 2,
  },
  metric: {
    p: 2,
    border: "1px solid",
    borderColor: "divider",
    bgcolor: "background.paper",
  },
  cardTitle: { minWidth: 230, maxWidth: 340, whiteSpace: "normal" },
  heat: { minWidth: 110, textAlign: "center" },
  details: { py: 2, px: 3, bgcolor: "background.default" },
} satisfies Record<string, SxProps<Theme>>;

export function heatStyle(percent: number): SxProps<Theme> {
  return {
    bgcolor:
      percent === 0
        ? "#edf6ef"
        : percent < 30
          ? "#fff5d9"
          : percent < 60
            ? "#ffe6c9"
            : "#f9d9d5",
    color: "#26343c",
    textAlign: "center",
  };
}
