import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { getApiError } from "@/shared/api";
import { useMemoryCommands } from "../model/useAssessmentMemory";
import { semanticLabels } from "../model/semanticLabels";
import type {
  AssessmentMemoryProps,
  MemoryDraft,
} from "../types/AssessmentMemory";

export function AssessmentMemory({
  target,
  finding,
  entries,
}: AssessmentMemoryProps) {
  const [draft, setDraft] = useState<MemoryDraft | null>(null);
  const { publish, withdraw } = useMemoryCommands(target);
  const current = entries.find(
    (e) => e.active && e.criterion_code === finding.code,
  );
  const error = publish.error ?? withdraw.error;
  return (
    <Stack spacing={1}>
      {current && (
        <Typography variant="body2">
          Ваш разбор: {semanticLabels[current.verdict]}. {current.reason}{" "}
          {current.embedded_at
            ? "Сохранён; использование настраивается во вкладке «Память ИИ»."
            : "Будет подготовлен к поиску при следующей проверке."}
        </Typography>
      )}
      <Stack direction="row" spacing={1}>
        <Button
          onClick={() => {
            publish.reset();
            setDraft({
              request_id: crypto.randomUUID(),
              criterion_code: finding.code,
              verdict: current?.verdict ?? finding.verdict,
              reason: current?.reason ?? "",
            });
          }}
        >
          Сохранить свой разбор
        </Button>
        {current && (
          <Button
            disabled={withdraw.isPending}
            onClick={() => withdraw.mutate(current.id)}
          >
            Исключить из памяти
          </Button>
        )}
      </Stack>
      {error && <Alert severity="error">{getApiError(error).message}</Alert>}
      <Dialog
        open={!!draft}
        onClose={() => !publish.isPending && setDraft(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="assessment-memory-title"
      >
        <DialogTitle id="assessment-memory-title">
          Разбор для будущих проверок
        </DialogTitle>
        {draft && (
          <>
            <DialogContent>
              <Stack spacing={2}>
                <Alert severity="info">
                  Пример будет использоваться только при проверке ваших занятий.
                  Оценка этой работы не меняется — её можно изменить отдельно.
                </Alert>
                <Typography>{finding.label}</Typography>
                <TextField
                  select
                  label="Ваш вердикт"
                  value={draft.verdict}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      verdict: e.target.value as MemoryDraft["verdict"],
                    })
                  }
                >
                  {Object.entries(semanticLabels).map(([value, label]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Почему такой вердикт верен"
                  multiline
                  minRows={3}
                  value={draft.reason}
                  onChange={(e) =>
                    setDraft({ ...draft, reason: e.target.value })
                  }
                  helperText="Объясните допустимую формулировку, пропуск или противоречие. 15–700 символов."
                  slotProps={{ htmlInput: { maxLength: 700 } }}
                />
                {publish.error && (
                  <Alert severity="error">
                    {getApiError(publish.error).message}
                  </Alert>
                )}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button
                disabled={publish.isPending}
                onClick={() => setDraft(null)}
              >
                Отмена
              </Button>
              <Button
                variant="contained"
                disabled={publish.isPending || draft.reason.trim().length < 15}
                onClick={() =>
                  publish.mutate(draft, { onSuccess: () => setDraft(null) })
                }
              >
                Использовать в будущих проверках
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Stack>
  );
}
