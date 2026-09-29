import { Alert, Stack, Typography } from "@mui/material";
import { useRecording } from "../model/useRecording";
import { RecordingStatus } from "./RecordingStatus";

export function RecordingSummary({ id }: { id: string }) {
  const recording = useRecording(id);
  return (
    <Stack spacing={1}>
      <Typography>{recording.data?.title ?? "Загрузка записи…"}</Typography>
      {recording.error && (
        <Alert severity="error">Не удалось загрузить запись</Alert>
      )}
      {recording.data && <RecordingStatus recording={recording.data} />}
    </Stack>
  );
}
