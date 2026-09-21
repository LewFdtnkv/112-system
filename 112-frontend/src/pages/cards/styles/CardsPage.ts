import type { SxProps, Theme } from "@mui/material";
import type { CSSProperties } from "react";
export const styles = {
  titleColumn: { width: "23%" } satisfies CSSProperties,
  incidentColumn: { width: "16%" } satisfies CSSProperties,
  addressColumn: { width: "21%" } satisfies CSSProperties,
  servicesColumn: { width: "14%" } satisfies CSSProperties,
  usageColumn: { width: "8%" } satisfies CSSProperties,
  updatedColumn: { width: "10%" } satisfies CSSProperties,
  actionsColumn: { width: "8%" } satisfies CSSProperties,
  actions: { mt: 2 } satisfies SxProps<Theme>,
};
