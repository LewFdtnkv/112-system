import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import {
  scenarioDifficultyLabels,
  type ScenarioInput,
} from "@/entities/training";
import { MenuItem, Stack } from "@mui/material";
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
        <TextField
          name="norm_seconds"
          type="number"
          label={
            form.role === "dds"
              ? "Норматив первой реакции, с"
              : "Учебный ориентир, с"
          }
          helperText={
            form.role === "dds"
              ? "От поступления до первого ручного статуса бригады. Без автоматического штрафа."
              : "Для таймера, не автоматической оценки"
          }
          slotProps={{ htmlInput: { min: 5, max: 600 } }}
          value={form.norm_seconds}
          onChange={(event) =>
            onChange({ ...form, norm_seconds: Number(event.target.value) })
          }
        />
      </Stack>
      <TextField
        name="role"
        select
        label="Учебная роль"
        value={form.role}
        onChange={(event) =>
          onChange({
            ...form,
            role: event.target.value as ScenarioInput["role"],
          })
        }
      >
        <MenuItem value="operator_112">Оператор 112</MenuItem>
        <MenuItem value="dds">Диспетчер ДДС</MenuItem>
      </TextField>
    </>
  );
}
