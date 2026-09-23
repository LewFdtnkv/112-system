import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import { useCardTranslation } from "../model/useCardTranslation";
import type { Props } from "../types/CardTranslationPanel";

export function CardTranslationPanel({ initialText, onApply, onClose }: Props) {
  const {
    source,
    setSource,
    translation,
    setTranslation,
    detectedLanguage,
    pending,
    error,
    translate,
  } = useCardTranslation(initialText);

  return (
    <Stack spacing={2} className="arm-translation-panel">
      <Typography variant="body2" color="text.secondary">
        Текст переводится на русский язык. Проверьте результат перед
        подстановкой в карточку.
      </Typography>
      <TextField
        label="Текст заявителя"
        value={source}
        onChange={(event) => setSource(event.target.value)}
        disabled={pending}
        multiline
        minRows={4}
        slotProps={{ htmlInput: { maxLength: 5000 } }}
        helperText={`${source.length} / 5000`}
        autoFocus
      />
      <Button
        variant="contained"
        onClick={translate}
        disabled={pending || !source.trim()}
      >
        {pending ? "Переводим…" : "Перевести"}
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
      {translation && (
        <TextField
          label="Перевод"
          value={translation}
          onChange={(event) => setTranslation(event.target.value)}
          multiline
          minRows={4}
          helperText={
            detectedLanguage
              ? `Определённый язык: ${detectedLanguage.toUpperCase()}`
              : "Проверьте текст перед подстановкой в карточку."
          }
        />
      )}
      <Stack
        direction="row"
        spacing={1}
        className="arm-translation-panel__actions"
      >
        <Button onClick={onClose} disabled={pending}>
          Отмена
        </Button>
        <Button
          variant="contained"
          disabled={!translation.trim() || pending}
          onClick={() => onApply(translation.trim())}
        >
          Подставить в карточку
        </Button>
      </Stack>
    </Stack>
  );
}
