import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import { RecordingStatus } from "@/entities/recording";
import { getApiError } from "@/shared/api";
import { ValidatedForm, ValidatedTextField } from "@/shared/ui/form-validation";
import { useSpeechDialog } from "../model/useSpeechDialog";
import type { SpeechDialogProps, SpeechForm } from "../types/SpeechDialog";

export function SpeechDialog(props: SpeechDialogProps) {
  const { kind, onClose, onAdd } = props;
  const m = useSpeechDialog(props);
  const field = (name: keyof SpeechForm) => {
    const { ref, ...props } = m.form.register(name);
    return { ...props, inputRef: ref };
  };
  return (
    <Dialog
      open
      onClose={m.create.isPending ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="speech-dialog-title"
    >
      <DialogTitle id="speech-dialog-title">
        {kind === "crew" ? "Озвучка руководителя бригады" : "Озвучка заявителя"}
      </DialogTitle>
      <DialogContent>
        {!m.create.data ? (
          <ValidatedForm
            id="speech-form"
            error={m.create.error}
            form={m.form}
            onValid={(values) => m.create.mutate(values)}
          >
            <Stack spacing={2}>
              <Typography>
                {kind === "crew"
                  ? "Обе реплики будут одним голосом. После приветствия ученик передаст сообщение, затем услышит подтверждение."
                  : "Введите только слова заявителя. После озвучки прослушайте запись и добавьте её в карточку."}
              </Typography>
              <ValidatedTextField
                {...field("title")}
                label="Название записи"
                required
                disabled={m.create.isPending}
                slotProps={{ htmlInput: { maxLength: 200 } }}
              />
              <ValidatedTextField
                {...field("voice")}
                select
                label="Голос"
                defaultValue="denis"
                required
                disabled={m.create.isPending || !m.voices.data}
              >
                {m.voices.data?.map((voice) => (
                  <MenuItem key={voice.id} value={voice.id}>
                    {voice.label}
                  </MenuItem>
                ))}
              </ValidatedTextField>
              {m.voices.error && (
                <Alert severity="error">
                  Не удалось загрузить голоса.{" "}
                  <Button onClick={() => void m.voices.refetch()}>
                    Повторить
                  </Button>
                </Alert>
              )}
              {kind === "caller" ? (
                <ValidatedTextField
                  {...field("text")}
                  label="Текст заявителя"
                  required
                  multiline
                  minRows={5}
                  disabled={m.create.isPending}
                  slotProps={{ htmlInput: { maxLength: 1000 } }}
                  helperText="До 1000 символов и 65 секунд. Если запись длиннее, текст потребуется сократить."
                />
              ) : (
                <>
                  <ValidatedTextField
                    {...field("greeting")}
                    label="Приветствие"
                    required
                    multiline
                    minRows={2}
                    disabled={m.create.isPending}
                    slotProps={{ htmlInput: { maxLength: 200 } }}
                  />
                  <ValidatedTextField
                    {...field("acknowledgment")}
                    label="Подтверждение"
                    required
                    multiline
                    minRows={2}
                    disabled={m.create.isPending}
                    slotProps={{ htmlInput: { maxLength: 200 } }}
                    helperText="Каждая реплика — до 200 символов и 20 секунд."
                  />
                </>
              )}
            </Stack>
          </ValidatedForm>
        ) : (
          <Stack spacing={2}>
            <Alert severity={m.ready ? "success" : "info"}>
              {m.ready
                ? "Записи готовы. Прослушайте их перед добавлением."
                : "Подготовка идёт в фоне. Можно закрыть окно — записи останутся в библиотеке."}
            </Alert>
            {m.recordings.map((r) => (
              <Stack key={r.id} spacing={1}>
                <Typography component="h3">{r.title}</Typography>
                <Typography variant="body2">{r.text}</Typography>
                <RecordingStatus recording={r} />
              </Stack>
            ))}
            {m.queryError && (
              <Alert severity="error">
                {getApiError(m.queryError).message}
              </Alert>
            )}
            <Button
              onClick={() => {
                m.create.reset();
              }}
            >
              Изменить текст или голос
            </Button>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={m.create.isPending}>
          Закрыть
        </Button>
        {m.create.data ? (
          <Button
            variant="contained"
            disabled={!m.ready}
            onClick={() => {
              onAdd(m.recordings);
              onClose();
            }}
          >
            Добавить в карточку
          </Button>
        ) : (
          <Button
            type="submit"
            form="speech-form"
            variant="contained"
            disabled={m.create.isPending || !m.voices.data}
          >
            {m.create.isPending ? "Отправка…" : "Озвучить"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
