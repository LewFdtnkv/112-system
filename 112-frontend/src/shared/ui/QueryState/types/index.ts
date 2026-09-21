import type { PropsWithChildren } from "react";
export type PageControlsProps = {
  total: number;
  page: number;
  size?: number;
  onPage: (page: number) => void;
};

export type QueryStateProps = PropsWithChildren<{
  pending: boolean;
  error: unknown;
  retry?: () => void;
}>;
