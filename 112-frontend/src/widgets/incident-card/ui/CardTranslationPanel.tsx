import { getApiError } from "@/shared/api/errors";
import { translateToRussian } from "@/shared/lib/translation/yandex";
import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import type { Props } from "../types/CardTranslationPanel";

export function CardTranslationPanel({
  initialText,
  onApply,
  onClose,
}: Props) {
  const [source, setSource] = useState(initialText);
  const [translation, setTranslation] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setSource(initialText);
    setTranslation("");
    setDetectedLanguage(undefined);
    setError(undefined);
  }, [initialText]);

  const translate = async () => {
    const text = source.trim();
    if (!text) {
      setError("Введите текст, который нужно перевести.");
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const result = await translateToRussian(text);
      setTranslation(result.text);
      setDetectedLanguage(result.detected_language_code ?? undefined);
    } catch (reason) {
      setError(getApiError(reason).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <Stack spacing={2} className="arm-translation-panel">
      <Typography variant="body2" color="text.secondary">
        Текст переводится на русский язык. Ключ Яндекса остаётся только на
        сервере.
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
      <Button variant="contained" onClick={() => void translate()} disabled={pending}>
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
      <Stack direction="row" spacing={1} className="arm-translation-panel__actions">
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
