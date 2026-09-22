import type { CSSProperties } from "react";
export const styles = {
  col: (width: string | number): CSSProperties => ({ width }),
  col2: { width: 44 } satisfies CSSProperties,
  col3: { width: 166 } satisfies CSSProperties,
  col4: { width: 44 } satisfies CSSProperties,
};
