import { trainingApi } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { FeatureInput } from "@/shared/ui/FeatureInput";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
} from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { styles } from "../styles/RuleForm";
import type { RuleFormProps } from "../types/CatalogRules";
import { FeatureVisibilityEditor } from "./FeatureVisibilityEditor";
export function RuleForm({ initial, editable, save, onSaved }: RuleFormProps) {
  const [form, setForm] = useState(initial);
  const mutation = useMutation({
    mutationFn: () =>
      save({
        ...form,
        features: form.features.map((f) => ({
          ...f,
          options: (f.options ?? []).map((v) => v.trim()).filter(Boolean),
        })),
      }),
    onSuccess: onSaved,
  });
  return (
    <Stack
      component="form"
      spacing={2}
      sx={styles.stack}
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <fieldset
        disabled={!editable || mutation.isPending}
        style={styles.fieldset}
      >
        <Stack spacing={2}>
          {(["code", "section", "name", "response_scenario"] as const).map(
            (key) => (
              <TextField
                key={key}
                required={key !== "response_scenario"}
                label={
                  {
                    code: "Код происшествия",
                    section: "Раздел",
                    name: "Название происшествия",
                    response_scenario: "Сценарий реагирования",
                  }[key]
                }
                value={form[key] ?? ""}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            ),
          )}
          <TextField
            label="Короткое название для ученика"
            value={form.display_name ?? ""}
            helperText="Без технического кода. Если не заполнено, используется название происшествия."
            slotProps={{ htmlInput: { maxLength: 100 } }}
            onChange={(e) =>
              setForm({ ...form, display_name: e.target.value || null })
            }
          />
          <FormControlLabel
            label="Популярный тип — показывать быструю кнопку"
            control={
              <Checkbox
                checked={form.is_popular ?? false}
                onChange={(_, v) => setForm({ ...form, is_popular: v })}
              />
            }
          />
          {form.is_popular && (
            <TextField
              label="Порядок быстрой кнопки"
              type="number"
              helperText="Меньшее число — раньше. Ученик видит до 11 популярных типов."
              slotProps={{ htmlInput: { min: 0, max: 10000 } }}
              value={form.popular_order ?? 0}
              onChange={(e) =>
                setForm({ ...form, popular_order: Number(e.target.value) })
              }
            />
          )}
          <FormControlLabel
            label="Требуется оповещение служб"
            control={
              <Checkbox
                checked={form.notification_required !== false}
                onChange={(_, v) =>
                  setForm({
                    ...form,
                    notification_required: v,
                    routes: v ? form.routes : [],
                  })
                }
              />
            }
          />
          {form.notification_required === false && (
            <Alert severity="info">
              Служебное обращение: регистрация без оповещения. Маршруты служб не
              задаются.
            </Alert>
          )}
          <b>Типовые признаки</b>
          {form.features.map((f, i) => (
            <Stack key={i} spacing={1}>
              <TextField
                required
                label={`Ключ признака ${i + 1}`}
                value={f.key}
                onChange={(e) =>
                  setForm({
                    ...form,
                    features: form.features.map((x, j) => ({
                      ...x,
                      key: j === i ? e.target.value : x.key,
                      visible_when: x.visible_when?.map((group) =>
                        Object.fromEntries(
                          Object.entries(group).map(([key, value]) => [
                            key === f.key ? e.target.value : key,
                            value,
                          ]),
                        ),
                      ),
                    })),
                    routes: form.routes.map((r) => ({
                      ...r,
                      when: Object.fromEntries(
                        Object.entries(r.when).map(([k, v]) => [
                          k === f.key ? e.target.value : k,
                          v,
                        ]),
                      ),
                    })),
                  })
                }
              />
              <TextField
                required
                fullWidth
                label={`Название признака ${i + 1}`}
                value={f.label}
                onChange={(e) =>
                  setForm({
                    ...form,
                    features: form.features.map((x, j) =>
                      j === i ? { ...x, label: e.target.value } : x,
                    ),
                  })
                }
              />
              <TextField
                select
                label={`Формат признака ${i + 1}`}
                disabled={form.features.some((x) =>
                  x.visible_when?.some((g) => f.key in g),
                )}
                value={f.type ?? "boolean"}
                onChange={(e) => {
                  const type = e.target.value as
                    "boolean" | "choice" | "array" | "text";
                  setForm({
                    ...form,
                    features: form.features.map((x, j) =>
                      j === i ? { ...x, type, options: [] } : x,
                    ),
                    routes: form.routes.map((r) => ({
                      ...r,
                      when: Object.fromEntries(
                        Object.entries(r.when).filter(([key]) => key !== f.key),
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
                    checked={f.required !== false}
                    onChange={(_, required) =>
                      setForm({
                        ...form,
                        features: form.features.map((x, j) =>
                          j === i ? { ...x, required } : x,
                        ),
                      })
                    }
                  />
                }
              />
              {(f.type === "choice" || f.type === "array") && (
                <TextField
                  multiline
                  label={`Варианты признака ${i + 1}`}
                  required={f.type === "choice"}
                  helperText="По одному значению в строке. Для списка можно оставить пустым — свободный ввод."
                  value={(f.options ?? []).join("\n")}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      features: form.features.map((x, j) =>
                        j === i
                          ? { ...x, options: e.target.value.split("\n") }
                          : x,
                      ),
                    })
                  }
                />
              )}
              <FeatureVisibilityEditor
                feature={f}
                parents={form.features.slice(0, i)}
                onChange={(visible_when) =>
                  setForm({
                    ...form,
                    features: form.features.map((x, j) =>
                      j === i ? { ...x, visible_when } : x,
                    ),
                  })
                }
              />
              {form.features.some((x) =>
                x.visible_when?.some((g) => f.key in g),
              ) && (
                <Alert severity="info">
                  От этого поля зависят другие признаки. Для удаления или смены
                  формата сначала измените их условия показа.
                </Alert>
              )}
              <Button
                disabled={form.features.some((x) =>
                  x.visible_when?.some((g) => f.key in g),
                )}
                onClick={() =>
                  setForm({
                    ...form,
                    features: form.features.filter((_, j) => j !== i),
                    routes: form.routes.map((r) => ({
                      ...r,
                      when: Object.fromEntries(
                        Object.entries(r.when).filter(([k]) => k !== f.key),
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
              setForm({
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
          {form.notification_required !== false && <b>Правила оповещения</b>}
          {form.routes.map((r, i) => (
            <Paper key={i} sx={styles.paper}>
              <Stack spacing={1}>
                <ServerSelect
                  label={`Служба маршрута ${i + 1}`}
                  queryKey={["admin-service-code-options"]}
                  disabled={!editable}
                  value={
                    r.service_code
                      ? { id: r.service_code, label: r.service_code }
                      : null
                  }
                  onChange={(v) =>
                    setForm({
                      ...form,
                      routes: form.routes.map((x, j) =>
                        j === i ? { ...x, service_code: v?.id ?? "" } : x,
                      ),
                    })
                  }
                  load={async (q, signal) =>
                    (await trainingApi.adminServices({ q }, signal)).items.map(
                      (s) => ({ id: s.code, label: `${s.code} — ${s.name}` }),
                    )
                  }
                />
                <FormControlLabel
                  label="Главная служба"
                  control={
                    <Checkbox
                      checked={r.is_main}
                      onChange={(_, v) =>
                        setForm({
                          ...form,
                          routes: form.routes.map((x, j) => ({
                            ...x,
                            is_main: j === i ? v : false,
                          })),
                        })
                      }
                    />
                  }
                />
                <span>Все выбранные условия должны выполняться:</span>
                {form.features
                  .filter((f) => f.key)
                  .map((f) => (
                    <FeatureInput
                      key={f.key}
                      feature={f}
                      condition
                      disabled={!editable}
                      value={r.when[f.key]}
                      onChange={(value) => {
                        const when = { ...r.when };
                        if (
                          value === undefined ||
                          (Array.isArray(value) && !value.length)
                        )
                          delete when[f.key];
                        else when[f.key] = value;
                        setForm({
                          ...form,
                          routes: form.routes.map((x, j) =>
                            j === i ? { ...x, when } : x,
                          ),
                        });
                      }}
                    />
                  ))}
                <Button
                  disabled={form.routes.length === 1}
                  onClick={() =>
                    setForm({
                      ...form,
                      routes: form.routes.filter((_, j) => j !== i),
                    })
                  }
                >
                  Удалить маршрут
                </Button>
              </Stack>
            </Paper>
          ))}
          <Button
            disabled={form.notification_required === false}
            onClick={() =>
              setForm({
                ...form,
                routes: [
                  ...form.routes,
                  { service_code: "", is_main: false, when: {} },
                ],
              })
            }
          >
            Добавить маршрут
          </Button>
          {editable && <Button type="submit">Сохранить правило</Button>}
        </Stack>
      </fieldset>
      {mutation.error && (
        <Alert severity="error">{getApiError(mutation.error).message}</Alert>
      )}
    </Stack>
  );
}
