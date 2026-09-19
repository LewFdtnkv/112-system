import { Alert, Button, Stack, TablePagination } from "@mui/material";
import type { PropsWithChildren } from "react";
import { getApiError } from "@/shared/api";
import { LoadingScreen } from "@/shared/ui/LoadingScreen";
export function QueryState({
  pending,
  error,
  retry,
  children,
}: PropsWithChildren<{
  pending: boolean;
  error: unknown;
  retry?: () => void;
}>) {
  if (pending) return <LoadingScreen />;
  return (
    <>
      {" "}
      {error ? (
        <Stack spacing={1}>
          <Alert severity="error">{getApiError(error).message}</Alert>
          {retry && <Button onClick={retry}>Повторить</Button>}
        </Stack>
      ) : null}
      {children}
    </>
  );
}
export function PageControls({
  total,
  page,
  onPage,
  size = 20,
}: {
  total: number;
  page: number;
  size?: number;
  onPage: (page: number) => void;
}) {
  return (
    <TablePagination
      component="div"
      count={total}
      page={page}
      rowsPerPage={size}
      rowsPerPageOptions={[size]}
      onPageChange={(_, next) => onPage(next)}
      labelDisplayedRows={({ from, to, count }) => `${from}–${to} из ${count}`}
      getItemAriaLabel={(type) =>
        type === "next" ? "Следующая страница" : "Предыдущая страница"
      }
    />
  );
}
