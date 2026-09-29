import {
  ValidatedForm,
  ValidatedTextField as TextField,
} from "@/shared/ui/form-validation";
import { useId, useState } from "react";
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
  AlertTitle,
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
  const formId = useId();
  const [draft, setDraft] = useState<MemoryDraft | null>(null);
  const { publish, withdraw } = useMemoryCommands(target);
  const current = entries.find(
    (e) => e.active && e.criterion_code === finding.code,
  );
  const error = withdraw.error;
  return (
    <Stack spacing={1}>
      {current && (
        <Alert severity="success">
          <AlertTitle>Исправление сохранено в памяти ИИ</AlertTitle>
          Ваш разбор: {semanticLabels[current.verdict]}. {current.reason}{" "}
          {current.embedded_at
            ? "Сохранён; использование настраивается во вкладке «Память ИИ»."
            : "Подготовка к поиску выполняется при новых проверках."}
        </Alert>
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
          {current ? "Изменить исправление ИИ" : "Исправить вывод ИИ"}
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
          Исправление для будущих проверок
        </DialogTitle>
        {draft && (
          <>
            <DialogContent>
              <ValidatedForm
                id={formId}
                spacing={2}
                error={publish.error}
                onSubmit={() =>
                  publish.mutate(draft, { onSuccess: () => setDraft(null) })
                }
              >
                <Alert severity="info">
                  Разбор попадёт в память ИИ для похожих ответов в ваших будущих
                  занятиях. ИИ учитывает подходящие примеры, но не обязан
                  повторять их вердикт. Текущая оценка не меняется: для неё
                  используйте «Пересмотреть оценку» вверху страницы.
                </Alert>
                <Typography>{finding.label}</Typography>
                <Typography variant="body2">
                  Вывод ИИ: {semanticLabels[finding.verdict]}. {finding.reason}
                </Typography>
                <TextField
                  select
                  name="verdict"
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
                  name="reason"
                  required
                  label="Почему такой вердикт верен"
                  multiline
                  minRows={3}
                  value={draft.reason}
                  onChange={(e) =>
                    setDraft({ ...draft, reason: e.target.value })
                  }
                  helperText="Объясните допустимую формулировку, пропуск или противоречие. 15–700 символов."
                  slotProps={{ htmlInput: { minLength: 15, maxLength: 700 } }}
                />
              </ValidatedForm>
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
                disabled={publish.isPending}
                type="submit"
                form={formId}
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
