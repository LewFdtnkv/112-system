import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import {
  scenarioDifficultyLabels,
  type ScenarioInput,
} from "@/entities/training";
import { Alert, MenuItem, Stack } from "@mui/material";
import { styles } from "../styles/ScenarioEditorPage";
import type { ScenarioMetadataFieldsProps } from "../types/ScenarioEditorPage";

export function ScenarioMetadataFields({
  form,
  onChange,
}: ScenarioMetadataFieldsProps) {
  return (
    <>
      <TextField
        name="title"
        label="Название сценария"
        multiline
        minRows={1}
        required
        value={form.title}
        onChange={(event) => onChange({ ...form, title: event.target.value })}
      />
      <TextField
        name="category"
        label="Категория"
        value={form.category}
        onChange={(event) =>
          onChange({ ...form, category: event.target.value })
        }
      />
      <Stack direction="row" sx={styles.metadata}>
        <TextField
          select
          label="Сложность"
          value={form.difficulty}
          onChange={(event) =>
            onChange({
              ...form,
              difficulty: event.target.value as ScenarioInput["difficulty"],
            })
          }
        >
          {Object.entries(scenarioDifficultyLabels).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          name="duration_minutes"
          type="number"
          label="Длительность, мин"
          slotProps={{ htmlInput: { min: 1, max: 120 } }}
          value={form.duration_minutes}
          onChange={(event) =>
            onChange({ ...form, duration_minutes: Number(event.target.value) })
          }
        />
        {form.role === "dds" ? (
          <Alert severity="info">
            Для новых карточек ДДС: открыть за 30 секунд, внести первый статус с
            текстом за 3 минуты от поступления. Это не срок завершения работ.
            Ранее назначенные занятия сохраняют свои правила.
          </Alert>
        ) : (
          <TextField
            name="norm_seconds"
            type="number"
            label="Учебный ориентир, с"
            helperText="Для таймера, не автоматической оценки"
            slotProps={{ htmlInput: { min: 5, max: 600 } }}
            value={form.norm_seconds}
            onChange={(event) =>
              onChange({ ...form, norm_seconds: Number(event.target.value) })
            }
          />
        )}
      </Stack>
    </>
  );
}
