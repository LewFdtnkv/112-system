import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import { FeatureVisibilityEditor } from "./FeatureVisibilityEditor";
import type { RuleFeaturesEditorProps } from "../types/RuleFormEditors";

export function RuleFeaturesEditor({
  form,
  onChange,
}: RuleFeaturesEditorProps) {
  const hasDependents = (key: string) =>
    form.features.some((feature) =>
      feature.visible_when?.some((group) => key in group),
    );
  return (
    <>
      <b>Типовые признаки</b>
      {form.features.map((feature, index) => (
        <Stack key={index} spacing={1}>
          <TextField
            required
            label={`Ключ признака ${index + 1}`}
            value={feature.key}
            onChange={(event) =>
              onChange({
                ...form,
                features: form.features.map((item, itemIndex) => ({
                  ...item,
                  key: itemIndex === index ? event.target.value : item.key,
                  visible_when: item.visible_when?.map((group) =>
                    Object.fromEntries(
                      Object.entries(group).map(([key, value]) => [
                        key === feature.key ? event.target.value : key,
                        value,
                      ]),
                    ),
                  ),
                })),
                routes: form.routes.map((route) => ({
                  ...route,
                  when: Object.fromEntries(
                    Object.entries(route.when).map(([key, value]) => [
                      key === feature.key ? event.target.value : key,
                      value,
                    ]),
                  ),
                })),
              })
            }
          />
          <TextField
            required
            fullWidth
            label={`Название признака ${index + 1}`}
            value={feature.label}
            onChange={(event) =>
              onChange({
                ...form,
                features: form.features.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, label: event.target.value }
                    : item,
                ),
              })
            }
          />
          <TextField
            select
            label={`Формат признака ${index + 1}`}
            disabled={hasDependents(feature.key)}
            value={feature.type ?? "boolean"}
            onChange={(event) => {
              const type = event.target.value as
                "boolean" | "choice" | "array" | "text";
              onChange({
                ...form,
                features: form.features.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, type, options: [] } : item,
                ),
                routes: form.routes.map((route) => ({
                  ...route,
                  when: Object.fromEntries(
                    Object.entries(route.when).filter(
                      ([key]) => key !== feature.key,
                    ),
                  ),
                })),
              });
            }}
          >
            <MenuItem value="boolean">Да / Нет</MenuItem>
            <MenuItem value="choice">Одно значение</MenuItem>
            <MenuItem value="array">Список значений</MenuItem>
            <MenuItem value="text">Текст</MenuItem>
          </TextField>
          <FormControlLabel
            label="Обязательный признак"
            control={
              <Checkbox
                checked={feature.required !== false}
                onChange={(_, required) =>
                  onChange({
                    ...form,
                    features: form.features.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, required } : item,
                    ),
                  })
                }
              />
            }
          />
          {(feature.type === "choice" || feature.type === "array") && (
            <TextField
              multiline
              label={`Варианты признака ${index + 1}`}
              required={feature.type === "choice"}
              helperText="По одному значению в строке. Для списка можно оставить пустым — свободный ввод."
              value={(feature.options ?? []).join("\n")}
              onChange={(event) =>
                onChange({
                  ...form,
                  features: form.features.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, options: event.target.value.split("\n") }
                      : item,
                  ),
                })
              }
            />
          )}
          <FeatureVisibilityEditor
            feature={feature}
            parents={form.features.slice(0, index)}
            onChange={(visible_when) =>
              onChange({
                ...form,
                features: form.features.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, visible_when } : item,
                ),
              })
            }
          />
          {hasDependents(feature.key) && (
            <Alert severity="info">
              От этого поля зависят другие признаки. Для удаления или смены
              формата сначала измените их условия показа.
            </Alert>
          )}
          <Button
            disabled={hasDependents(feature.key)}
            onClick={() =>
              onChange({
                ...form,
                features: form.features.filter(
                  (_, itemIndex) => itemIndex !== index,
                ),
                routes: form.routes.map((route) => ({
                  ...route,
                  when: Object.fromEntries(
                    Object.entries(route.when).filter(
                      ([key]) => key !== feature.key,
                    ),
                  ),
                })),
              })
            }
          >
            Убрать
          </Button>
        </Stack>
      ))}
      <Button
        onClick={() =>
          onChange({
            ...form,
            features: [
              ...form.features,
              { key: `feature_${form.features.length + 1}`, label: "" },
            ],
          })
        }
      >
        Добавить признак
      </Button>
    </>
  );
}
