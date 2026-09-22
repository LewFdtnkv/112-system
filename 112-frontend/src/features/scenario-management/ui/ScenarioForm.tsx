import SaveIcon from "@mui/icons-material/Save";
import { Button, MenuItem, Stack, TextField } from "@mui/material";
import { Controller, useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import type { ScenarioFormProps } from "../types/ScenarioForm";

import {
  scenarioDifficultyLabels,
  scenarioStatusLabels,
  type ScenarioDraft,
} from "@/entities/scenario";
import { routePaths } from "@/shared/config/routes";

export const ScenarioForm = ({ initialValues, onSave }: ScenarioFormProps) => {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ScenarioDraft>({
    defaultValues: {
      name: initialValues?.name ?? "",
      category: initialValues?.category ?? "",
      description: initialValues?.description ?? "",
      durationMinutes: initialValues?.durationMinutes ?? 15,
      normSeconds: initialValues?.normSeconds ?? 30,
      difficulty: initialValues?.difficulty ?? "basic",
      status: initialValues?.status ?? "draft",
    },
  });

  return (
    <Stack
      component="form"
      spacing={2}
      onSubmit={handleSubmit((values) =>
        onSave({
          ...values,
          name: values.name.trim(),
          category: values.category.trim(),
          description: values.description.trim(),
        }),
      )}
      noValidate
    >
      <TextField
        label="Название"
        {...register("name", {
          validate: (value) =>
            value.trim().length >= 3 || "Введите не менее трёх символов",
        })}
        error={Boolean(errors.name)}
        helperText={errors.name?.message}
      />
      <TextField
        label="Категория"
        {...register("category", {
          validate: (value) => value.trim().length > 0 || "Укажите категорию",
        })}
        error={Boolean(errors.category)}
        helperText={errors.category?.message}
      />
      <TextField
        label="Описание"
        multiline
        minRows={3}
        {...register("description", {
          validate: (value) => value.trim().length > 0 || "Добавьте описание",
        })}
        error={Boolean(errors.description)}
        helperText={errors.description?.message}
      />
      <TextField
        label="Продолжительность, мин"
        type="number"
        slotProps={{ htmlInput: { min: 1, max: 120, step: 1 } }}
        {...register("durationMinutes", {
          valueAsNumber: true,
          validate: (value) =>
            (Number.isInteger(value) && value >= 1 && value <= 120) ||
            "Укажите целое число от 1 до 120",
        })}
        error={Boolean(errors.durationMinutes)}
        helperText={errors.durationMinutes?.message}
      />
      <TextField
        label="Норматив заполнения карточки, с"
        type="number"
        slotProps={{ htmlInput: { min: 5, max: 600, step: 5 } }}
        {...register("normSeconds", {
          valueAsNumber: true,
          validate: (value) =>
            (Number.isInteger(value) && value >= 5 && value <= 600) ||
            "Укажите целое число от 5 до 600",
        })}
        error={Boolean(errors.normSeconds)}
        helperText={
          errors.normSeconds?.message ??
          "С этим значением сравнивается фактическое время работы обучающегося"
        }
      />
      <Controller
        name="difficulty"
        control={control}
        render={({ field: { ref, ...field } }) => (
          <TextField {...field} inputRef={ref} select label="Сложность">
            {Object.entries(scenarioDifficultyLabels).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
        )}
      />
      <Controller
        name="status"
        control={control}
        render={({ field: { ref, ...field } }) => (
          <TextField {...field} inputRef={ref} select label="Статус">
            {Object.entries(scenarioStatusLabels).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
        )}
      />
      <div>
        <Button type="submit" startIcon={<SaveIcon />} disabled={isSubmitting}>
          Сохранить
        </Button>
        <Button component={Link} to={routePaths.scenarios}>
          Отмена
        </Button>
      </div>
    </Stack>
  );
};
