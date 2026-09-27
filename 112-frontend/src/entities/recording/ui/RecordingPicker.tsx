import { Alert, Button, Stack } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import { getApiError } from "@/shared/api";
import { validateUploadSize } from "@/shared/lib/uploads";
import { recordingApi } from "../api/recordingApi";
import { useRecording } from "../model/useRecording";
import type { RecordingPickerProps } from "../types/recording";
import { RecordingPreview } from "./RecordingPreview";

export function RecordingPicker({
  purpose,
  label,
  value,
  onChange,
  disabled,
}: RecordingPickerProps) {
  const selected = useRecording(value);
  const client = useQueryClient();
  const upload = useMutation({
    mutationKey: ["recording-upload"],
    mutationFn: (file: File) => {
      validateUploadSize(file);
      return recordingApi.upload(file, purpose);
    },
    onSuccess: (recording) => {
      client.setQueryData(["recording", recording.id], recording);
      void client.invalidateQueries({ queryKey: ["recordings"] });
      onChange(recording.id);
    },
  });
  return (
    <Stack spacing={1}>
      <ServerSelect
        label={label}
        queryKey={["recordings", purpose]}
        value={
          value
            ? { id: value, label: selected.data?.title ?? "Загрузка записи…" }
            : null
        }
        disabled={disabled || upload.isPending}
        onChange={(next) => onChange(next?.id ?? null)}
        load={async (query, signal) =>
          (
            await recordingApi.list({ query, purpose, limit: 100 }, signal)
          ).items
            .filter((r) => r.status === "ready")
            .map((r) => ({ id: r.id, label: r.title }))
        }
      />
      <Button component="label" disabled={disabled || upload.isPending}>
        {upload.isPending ? "Загрузка…" : "Загрузить WAV (до 1 МБ)"}
        <input
          hidden
          type="file"
          accept=".wav,audio/wav"
          aria-label={`Загрузить: ${label}`}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
            e.target.value = "";
          }}
        />
      </Button>
      {value && selected.data?.status === "ready" && (
        <RecordingPreview key={value} id={value} />
      )}
      {(upload.error || selected.error) && (
        <Alert severity="error">
          {getApiError(upload.error || selected.error).message}
        </Alert>
      )}
    </Stack>
  );
}
