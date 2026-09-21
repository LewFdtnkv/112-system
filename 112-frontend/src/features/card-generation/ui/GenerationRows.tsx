import { Alert, Button, Chip, TableCell, TableRow } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { generationApi, type GenerationJob } from "@/entities/training";
import { getApiError } from "@/shared/api";

export function GenerationRows({ jobs }: { jobs: GenerationJob[] }) {
  const client = useQueryClient();
  const retry = useMutation({
    mutationFn: generationApi.retry,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["card-generations"] }),
  });
  return (
    <>
      {jobs.map((job) => (
        <TableRow className="generation-pending" key={job.id}>
          <TableCell>
            <strong>{job.title}</strong>
            <small>
              <Chip
                size="small"
                color={job.status === "failed" ? "error" : "info"}
                label={
                  job.status === "running"
                    ? "Генерируется"
                    : job.status === "failed"
                      ? "Ошибка генерации"
                      : "В очереди"
                }
              />
            </small>
            {job.error && <small>{job.error}</small>}
          </TableCell>
          <TableCell>{job.incident_name}</TableCell>
          <TableCell>{job.address_text}</TableCell>
          <TableCell>{job.services.join(", ") || "Без оповещения"}</TableCell>
          <TableCell align="center">—</TableCell>
          <TableCell>
            {new Date(job.created_at).toLocaleString("ru-RU", {
              timeZone: "Europe/Moscow",
              dateStyle: "short",
              timeStyle: "short",
            })}
          </TableCell>
          <TableCell align="center">
            {job.status === "failed" ? (
              <Button
                disabled={retry.isPending}
                onClick={() => retry.mutate(job.id)}
              >
                Повторить
              </Button>
            ) : (
              "Подготовка"
            )}
          </TableCell>
        </TableRow>
      ))}
      {retry.error && (
        <TableRow>
          <TableCell colSpan={7}>
            <Alert severity="error">{getApiError(retry.error).message}</Alert>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
