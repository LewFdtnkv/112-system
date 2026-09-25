import { getApiError } from "@/shared/api";
import {
  Alert,
  Checkbox,
  FormControlLabel,
  Stack,
  Typography,
} from "@mui/material";
import { useGenerationExample } from "../model/useGenerationExample";
import type { GenerationExampleProps } from "../types/GenerationExample";

export function GenerationExample({ card }: GenerationExampleProps) {
  const save = useGenerationExample(card);
  return (
    <Stack spacing={1}>
      <FormControlLabel
        control={
          <Checkbox
            checked={
              save.isPending
                ? save.variables
                : (card.generation_example ?? false)
            }
            disabled={save.isPending || !card.caller_message}
            onChange={(_, enabled) => save.mutate(enabled)}
          />
        }
        label="Использовать как пример генерации"
      />
      <Typography variant="body2" color="text.secondary">
        Отметьте после проверки условия и эталонного решения. ИИ будет
        использовать карточку как образец речи только для ваших генераций. После
        редактирования отметка сбросится. Её можно снять в любой момент.
      </Typography>
      {save.error && (
        <Alert severity="error">{getApiError(save.error).message}</Alert>
      )}
    </Stack>
  );
}
