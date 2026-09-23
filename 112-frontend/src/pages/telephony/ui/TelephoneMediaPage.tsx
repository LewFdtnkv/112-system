import { Alert, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { PageHeader } from "@/shared/ui/PageHeader";
import { getApiError } from "@/shared/api";
import { useMedia } from "../model/useMedia";
import { MediaEditor } from "./MediaEditor";
import "../styles/telephony.scss";
export function TelephoneMediaPage() {
  const { version, setVersion, scenarios, media } = useMedia();
  const error = scenarios.error || media.error;
  return (
    <Stack spacing={2} className="telephony-page">
      <PageHeader title="Записи учебных звонков" />
      <Typography>
        Подготовьте речь собеседников до занятия. Можно загрузить готовую запись
        или передать текст подключённому генератору. Готовые записи используются
        повторно без ожидания синтеза.
      </Typography>
      <Alert severity="info">
        Формат записи: WAV PCM, 8000 Гц, моно, 16 бит, до 10 минут. Без
        подключённого генератора используйте «Загрузить WAV». В этой версии
        собеседник воспроизводит запись; речь ученика не распознаётся.
      </Alert>
      <TextField
        label="Сценарий"
        select
        value={version}
        onChange={(event) => setVersion(event.target.value)}
      >
        <MenuItem value="">Выберите сценарий</MenuItem>
        {scenarios.data?.items.map((scenario) => (
          <MenuItem key={scenario.id} value={scenario.id}>
            {scenario.title} · {scenario.role === "dds" ? "ДДС" : "112"}
          </MenuItem>
        ))}
      </TextField>
      {error && <Alert severity="error">{getApiError(error).message}</Alert>}
      {media.data?.map((cue) => (
        <MediaEditor key={`${cue.id}:${cue.audio.id}`} cue={cue} />
      ))}
      {version && media.data?.length === 0 && (
        <Typography>
          У карточек этого сценария нет текста собеседника или учебных
          контактов.
        </Typography>
      )}
    </Stack>
  );
}
