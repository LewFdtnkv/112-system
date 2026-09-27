import "../styles/recording.scss";
import { Alert, Button, Stack } from "@mui/material";
import { getApiError } from "@/shared/api";
import { useRecordingPreview } from "../model/useRecording";

export function RecordingPreview({
  id,
  label = "Прослушать",
}: {
  id: string;
  label?: string;
}) {
  const preview = useRecordingPreview(id);
  return (
    <Stack spacing={1}>
      <Button onClick={() => preview.mutate()} disabled={preview.isPending}>
        {label}
      </Button>
      {preview.data && (
        <audio
          src={preview.data}
          controls
          autoPlay
          aria-label={label}
          className="recording-preview"
        />
      )}
      {preview.error && (
        <Alert severity="error">{getApiError(preview.error).message}</Alert>
      )}
    </Stack>
  );
}
