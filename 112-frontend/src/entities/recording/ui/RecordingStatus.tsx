import { Alert, Button, Stack, Typography } from "@mui/material";
import { getApiError } from "@/shared/api";
import type { RecordingStatusProps } from "../types/recording";
import { useRetryRecording } from "../model/useRecording";
import { RecordingPreview } from "./RecordingPreview";

export function RecordingStatus({ recording }: RecordingStatusProps) {
  const retry = useRetryRecording(recording.id);
  if (recording.status === "ready")
    return (
      <RecordingPreview
        id={recording.id}
        label={`Прослушать «${recording.title}»`}
      />
    );
  return (
    <Stack spacing={1}>
      {recording.status === "failed" ? (
        <>
          <Alert severity="error">
            {recording.error || "Не удалось подготовить запись"}
          </Alert>
          <Button disabled={retry.isPending} onClick={() => retry.mutate()}>
            Повторить озвучку
          </Button>
        </>
      ) : (
        <Typography role="status">
          {recording.status === "preparing"
            ? "Идёт озвучка…"
            : "В очереди на озвучку…"}
        </Typography>
      )}
      {retry.error && (
        <Alert severity="error">{getApiError(retry.error).message}</Alert>
      )}
    </Stack>
  );
}
