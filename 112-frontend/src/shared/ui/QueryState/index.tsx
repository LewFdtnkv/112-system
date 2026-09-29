import { getApiError } from "@/shared/api";
import { LoadingScreen } from "@/shared/ui/LoadingScreen";
import { Alert, Button, Stack, TablePagination } from "@mui/material";
import type { PageControlsProps, QueryStateProps } from "./types/index";
export function QueryState({
  pending,
  error,
  retry,
  children,
}: QueryStateProps) {
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
}: PageControlsProps) {
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
