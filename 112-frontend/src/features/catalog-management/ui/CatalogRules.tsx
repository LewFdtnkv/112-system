import { rowAction } from "@/shared/lib/rowAction";
import { FeatureInput } from "@/shared/ui/FeatureInput";
import { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { trainingApi, type CatalogRule } from "@/entities/training";
import { getApiError } from "@/shared/api";
import { useDebounced } from "@/shared/lib/useDebounced";
import { QueryState, PageControls } from "@/shared/ui/QueryState";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import { FeatureVisibilityEditor } from "./FeatureVisibilityEditor";
export function CatalogFiles({ onImported }: { onImported: () => void }) {
  const [error, setError] = useState("");
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 8 * 1024 * 1024) throw new Error("Файл больше 8 МБ");
      return trainingApi.importCatalog(await file.text());
    },
    onSuccess: () => {
      setError("");
      onImported();
    },
    onError: (e) =>
      setError(
        e instanceof Error && e.message === "Файл больше 8 МБ"
          ? e.message
          : getApiError(e).message,
      ),
  });
  return (
    <Stack spacing={1}>
      <Alert severity="info">
        Импорт создаёт черновик ЕКП. Проверьте признаки и маршруты перед
        публикацией. Опубликованные версии сохраняются для уже назначенных
        уроков.
      </Alert>
      <Button component="label" disabled={upload.isPending}>
        Загрузить JSON-файл
        <input
          hidden
          aria-label="Загрузить ЕКП JSON"
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
            e.target.value = "";
          }}
        />
      </Button>
      <Button
        component="a"
        href={`${import.meta.env.BASE_URL}examples/classifier.json`}
        download="ekp-example.json"
      >
        Скачать пример JSON
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
      {upload.isSuccess && (
        <Alert severity="success">Черновик ЕКП загружен</Alert>
      )}
    </Stack>
  );
}
export function CatalogRules({
  versionId,
  onClose,
  onChanged,
}: {
  versionId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [q, setQ] = useState("");
  const search = useDebounced(q);
  const [page, setPage] = useState(0);
  const [entryId, setEntryId] = useState<string>();
  const [label, setLabel] = useState("");
  const query = useQuery({
    queryKey: ["catalog-rules", versionId, search, page],
    queryFn: ({ signal }) =>
      trainingApi.catalogRules(
        versionId,
        { q: search, offset: page * 20 },
        signal,
      ),
  });
  const detail = useQuery({
    queryKey: ["catalog-rule", versionId, entryId],
    enabled: !!entryId,
    queryFn: ({ signal }) =>
      trainingApi.catalogRule(versionId, entryId!, signal),
  });
  const clone = useMutation({
    mutationFn: () => trainingApi.cloneCatalog(versionId, label),
    onSuccess: () => {
      onChanged();
      onClose();
    },
  });
  const download = useMutation({
    mutationFn: async () => {
      const blob = await trainingApi.exportCatalog(versionId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ekp-${versionId}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>ЕКП: {query.data?.version.label}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Button
            onClick={() => download.mutate()}
            disabled={download.isPending}
          >
            Скачать JSON
          </Button>
          {query.data?.version.status !== "draft" && (
            <Alert severity="info">
              Эта версия опубликована. Для изменения правил создайте новый
              черновик.
            </Alert>
          )}
          <Stack
            component="form"
            direction="row"
            spacing={1}
            onSubmit={(e) => {
              e.preventDefault();
              clone.mutate();
            }}
          >
            <TextField
              fullWidth
              required
              label="Название новой версии ЕКП"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <Button type="submit" disabled={clone.isPending}>
              Создать новую версию
            </Button>
          </Stack>
          {(clone.error || download.error) && (
            <Alert severity="error">
              {getApiError(clone.error || download.error).message}
            </Alert>
          )}
          <TextField
            label="Поиск правила ЕКП"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
          <QueryState
            pending={query.isPending}
            error={query.error}
            retry={() => void query.refetch()}
          >
            {query.data && (
              <>
                <Table aria-label="Правила ЕКП">
                  <TableHead>
                    <TableRow>
                      <TableCell>Код</TableCell>
                      <TableCell>Раздел</TableCell>
                      <TableCell>Происшествие</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {query.data.items.map((e) => (
                      <TableRow
                        key={e.id}
                        {...rowAction(() => setEntryId(e.id))}
                      >
                        <TableCell>{e.code}</TableCell>
                        <TableCell>{e.section}</TableCell>
                        <TableCell>
                          <Button
                            className="table-block-link"
                            onClick={() => setEntryId(e.id)}
                          >
                            {e.name}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <PageControls
                  total={query.data.total}
                  page={page}
                  onPage={setPage}
                />
              </>
            )}
          </QueryState>
          <Button onClick={onClose}>Закрыть справочник</Button>
        </Stack>
      </DialogContent>
      {entryId && (
        <Dialog
          open
          fullWidth
          maxWidth="md"
          onClose={() => setEntryId(undefined)}
        >
          <DialogTitle>Правило ЕКП</DialogTitle>
          <DialogContent>
            <QueryState
              pending={detail.isPending}
              error={detail.error}
              retry={() => void detail.refetch()}
            >
              {detail.data && (
                <RuleForm
                  key={`${entryId}-${detail.data.revision}`}
                  initial={detail.data.entry}
                  editable={query.data?.version.status === "draft"}
                  save={(entry) =>
                    trainingApi.updateCatalogRule(
                      versionId,
                      entryId,
                      detail.data!.revision,
                      entry,
                    )
                  }
                  onSaved={() => {
                    setEntryId(undefined);
                    void query.refetch();
                    onChanged();
                  }}
                />
              )}
            </QueryState>
            <Button onClick={() => setEntryId(undefined)}>
              Закрыть правило
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
function RuleForm({
  initial,
  editable,
  save,
  onSaved,
}: {
  initial: CatalogRule;
  editable: boolean;
  save: (entry: CatalogRule) => Promise<unknown>;
  onSaved: () => void;
}) {
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
      sx={{ pt: 1 }}
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <fieldset
        disabled={!editable || mutation.isPending}
        style={{ border: 0, padding: 0 }}
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
            <Paper key={i} sx={{ p: 2 }}>
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
