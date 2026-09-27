import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import { ValidatedForm } from "@/shared/ui/form-validation";
import { useForm } from "react-hook-form";
import { Alert, Button, Chip, Stack, Typography } from "@mui/material";
import { audioStatusLabels } from "@/entities/telephony";
import type { AudioInput, MediaCue } from "@/entities/telephony";
import { getApiError } from "@/shared/api";
import { useMediaEditor } from "../model/useMedia";
export function MediaEditor({ cue }: { cue: MediaCue }) {
  const { update, upload, preview, url } = useMediaEditor(cue.id);
  const form = useForm<AudioInput>({
    defaultValues: {
      text: cue.audio.text,
      voice: cue.audio.voice,
      generator_version: cue.audio.generator_version?.startsWith("upload:")
        ? undefined
        : cue.audio.generator_version,
    },
  });
  const error = update.error || upload.error || preview.error;
  return (
    <Stack
      spacing={1}
      component="article"
      className="telephony-page__recording"
    >
      <div className="telephony-page__recording-title">
        <Typography className="telephony-page__recording-label">
          {cue.card_title} · {cue.contact_name}
        </Typography>
        <Chip
          size="small"
          label={audioStatusLabels[cue.audio.status]}
          color={cue.audio.status === "ready" ? "success" : "default"}
        />
      </div>
      <ValidatedForm
        form={form}
        error={update.error}
        onValid={(data) => update.mutate(data)}
      >
        <TextField
          fullWidth
          label="Текст учебного собеседника"
          multiline
          minRows={3}
          required
          slotProps={{ inputLabel: { shrink: true } }}
          {...form.register("text")}
        />
        <div className="telephony-page__form">
          <TextField
            label="Голос"
            required
            slotProps={{ inputLabel: { shrink: true } }}
            {...form.register("voice")}
          />
          <Button type="submit" disabled={update.isPending}>
            Сохранить и подготовить
          </Button>
          <Button
            component="label"
            variant="outlined"
            disabled={upload.isPending}
          >
            {upload.isPending ? "Загрузка…" : "Загрузить WAV (до 1 МБ)"}
            <input
              hidden
              type="file"
              accept=".wav,audio/wav"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) upload.mutate(file);
                event.target.value = "";
              }}
            />
          </Button>
          {cue.audio.status === "ready" && (
            <Button
              onClick={() => preview.mutate()}
              disabled={preview.isPending}
            >
              Прослушать
              {cue.audio.duration_seconds
                ? ` · ${Math.round(cue.audio.duration_seconds)} с`
                : ""}
            </Button>
          )}
        </div>
      </ValidatedForm>
      {url && <audio src={url} controls autoPlay />}
      {(error || cue.audio.error) && (
        <Alert severity="error">
          {error ? getApiError(error).message : cue.audio.error}
        </Alert>
      )}
    </Stack>
  );
}
