import type { CreateMemoryDialogProps } from "../types/CreateMemoryDialog";
import { useId } from "react";
import { Controller } from "react-hook-form";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
} from "@mui/material";
import {
  ValidatedForm,
  ValidatedTextField as TextField,
} from "@/shared/ui/form-validation";
import { QueryState } from "@/shared/ui/QueryState";
import { useCreateMemory } from "../model/useCreateMemory";

export function CreateMemoryDialog({ onClose }: CreateMemoryDialogProps) {
  const id = useId();
  const { form, criteria, save } = useCreateMemory(onClose);
  return (
    <Dialog
      open
      onClose={() => !save.isPending && onClose()}
      fullWidth
      maxWidth="md"
      aria-labelledby={`${id}-title`}
    >
      <DialogTitle id={`${id}-title`}>Новый разбор для ИИ</DialogTitle>
      <DialogContent>
        <QueryState
          pending={criteria.isPending}
          error={criteria.error}
          retry={() => void criteria.refetch()}
        >
          <ValidatedForm
            id={id}
            form={form}
            onValid={(values) => save.mutate(values)}
            error={save.error}
            spacing={2}
          >
            <Alert severity="info">
              Опишите один учебный пример без персональных данных: что известно,
              что ответил ученик и почему это допустимо или ошибочно. Разбор
              поможет в похожих будущих проверках ваших занятий. Старые оценки
              не изменятся.
            </Alert>
            <Controller
              control={form.control}
              name="criterion_code"
              render={({ field }) => (
                <TextField {...field} select label="Что проверяем" required>
                  {criteria.data?.map((c) => (
                    <MenuItem key={c.code} value={c.code}>
                      {c.label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              control={form.control}
              name="condition"
              render={({ field }) => (
                <TextField
                  {...field}
                  required
                  multiline
                  minRows={3}
                  label="Условие и известные факты"
                  helperText="Укажите всё, что нужно для вывода: обстоятельства, этап работы бригады или назначение дополнительной службы."
                  slotProps={{ htmlInput: { minLength: 15, maxLength: 3000 } }}
                />
              )}
            />
            <Controller
              control={form.control}
              name="answer"
              render={({ field }) => (
                <TextField
                  {...field}
                  multiline
                  minRows={2}
                  label="Пример ответа ученика"
                  helperText="Можно оставить пустым, если разбираете отсутствие ответа."
                  slotProps={{ htmlInput: { maxLength: 2000 } }}
                />
              )}
            />
            <Controller
              control={form.control}
              name="verdict"
              render={({ field }) => (
                <TextField {...field} select required label="Ваш вердикт">
                  <MenuItem value="correct">Засчитано</MenuItem>
                  <MenuItem value="partial">Частично</MenuItem>
                  <MenuItem value="incorrect">Расхождение</MenuItem>
                  <MenuItem value="uncertain">Нужна проверка</MenuItem>
                </TextField>
              )}
            />
            <Controller
              control={form.control}
              name="reason"
              render={({ field }) => (
                <TextField
                  {...field}
                  required
                  multiline
                  minRows={2}
                  label="Почему такой вердикт верен"
                  helperText="Коротко объясните правило и его применение к этому ответу. 15–700 символов."
                  slotProps={{ htmlInput: { minLength: 15, maxLength: 700 } }}
                />
              )}
            />
          </ValidatedForm>
        </QueryState>
      </DialogContent>
      <DialogActions>
        <Button disabled={save.isPending} onClick={onClose}>
          Отмена
        </Button>
        <Button
          type="submit"
          form={id}
          variant="contained"
          disabled={save.isPending || !criteria.isSuccess}
        >
          Сохранить разбор
        </Button>
      </DialogActions>
    </Dialog>
  );
}
