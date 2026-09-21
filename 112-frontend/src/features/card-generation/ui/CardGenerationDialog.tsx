import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Autocomplete,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import {
  generationApi,
  trainingApi,
  type GenerationParameters,
  type FeatureDefinition,
} from "@/entities/training";
import { getApiError } from "@/shared/api";
import { ServerSelect, type SelectOption } from "@/shared/ui/ServerSelect";
import { QueryState } from "@/shared/ui/QueryState";
import { FeatureInput } from "@/shared/ui/FeatureInput";
import {
  activeFeatureDefinitions,
  updateFeatureAnswer,
} from "@/shared/lib/featureValues";
import { randomUUID as createUuid } from "@/shared/lib/uuid";
import "./generation.scss";

const random: SelectOption = { id: "", label: "Случайно" };
export function CardGenerationDialog({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const [count, setCount] = useState(1);
  const [requestId, setRequestId] = useState(createUuid);
  const [p, setP] = useState<GenerationParameters>({});
  const [version, setVersion] = useState<SelectOption | null>(random);
  const [entry, setEntry] = useState<SelectOption | null>(random);
  const [services, setServices] = useState<SelectOption[]>([]);
  const [serviceChoice, setServiceChoice] = useState<SelectOption | null>(null);
  const [manualServices, setManualServices] = useState(false);
  const [features, setFeatures] = useState<FeatureDefinition[]>([]);
  const options = useQuery({
    queryKey: ["generation-options"],
    queryFn: ({ signal }) => generationApi.options(signal),
  });
  function change(values: Partial<GenerationParameters>) {
    setP((prev) => ({ ...prev, ...values }));
    setRequestId(createUuid());
  }
  const save = useMutation({
    mutationFn: () =>
      generationApi.create(requestId, count, {
        ...p,
        classifier_version_id: version?.id || null,
        classifier_entry_id: entry?.id || null,
        service_ids: manualServices ? services.map((s) => s.id) : null,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["card-generations"] });
      onClose();
    },
  });
  const textChoice = (
    key: "locality" | "street" | "house" | "object" | "caller_name",
    label: string,
    values: string[],
  ) => (
    <Autocomplete
      key={key}
      freeSolo
      options={["Случайно", ...values]}
      value={p[key] ?? "Случайно"}
      onChange={(_, value) =>
        change({ [key]: !value || value === "Случайно" ? null : value })
      }
      onInputChange={(_, value, reason) => {
        if (reason === "input") change({ [key]: value || null });
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          helperText="Выберите или введите своё значение"
        />
      )}
    />
  );
  return (
    <Dialog
      open
      onClose={save.isPending ? undefined : onClose}
      maxWidth="lg"
      fullWidth
      aria-labelledby="generation-title"
    >
      <DialogTitle id="generation-title">
        Сгенерировать карточки нейросетью
      </DialogTitle>
      <DialogContent>
        <QueryState
          pending={options.isPending}
          error={options.error}
          retry={() => void options.refetch()}
        >
          {options.data && (
            <fieldset className="generation-form" disabled={save.isPending}>
              <Alert severity="info">
                Общие настройки применяются ко всему пакету. «Случайно»
                выбирается заново для каждой карточки. Версия ЕКП одна для всего
                пакета. Готовые материалы проверьте перед добавлением в
                сценарий.
              </Alert>
              <TextField
                label="Количество карточек"
                type="number"
                value={count}
                onChange={(e) => {
                  setCount(Number(e.target.value));
                  setRequestId(createUuid());
                }}
                slotProps={{
                  htmlInput: { min: 1, max: options.data.max_count },
                }}
                helperText={`От 1 до ${options.data.max_count}; генерация идёт по очереди`}
              />
              <h3>Происшествие и службы</h3>
              <div className="generation-grid">
                <ServerSelect
                  label="Версия ЕКП"
                  value={version}
                  queryKey={["generation-classifiers"]}
                  load={async (q, signal) => [
                    random,
                    ...(await trainingApi.classifiers(q, signal)).map((v) => ({
                      id: v.id,
                      label: v.label,
                    })),
                  ]}
                  onChange={(v) => {
                    setVersion(v ?? random);
                    setEntry(random);
                    setFeatures([]);
                    change({ feature_answers: {} });
                  }}
                />
                <ServerSelect
                  label="Тип происшествия"
                  value={entry}
                  disabled={!version?.id}
                  queryKey={["generation-entries", version?.id]}
                  load={async (q, signal) => [
                    random,
                    ...(
                      await trainingApi.entries(version!.id, { q }, signal)
                    ).map((v) => ({
                      id: v.id,
                      label: v.display_name || v.name,
                      metadata: v.conditions.features,
                    })),
                  ]}
                  onChange={(v) => {
                    setEntry(v ?? random);
                    setFeatures((v?.metadata ?? []) as FeatureDefinition[]);
                    change({ feature_answers: {} });
                  }}
                />
                <TextField
                  select
                  label="Службы для оповещения"
                  value={manualServices ? "manual" : "random"}
                  onChange={(e) => {
                    setManualServices(e.target.value === "manual");
                    setRequestId(createUuid());
                  }}
                >
                  <MenuItem value="random">
                    Случайно · по ЕКП выбранного происшествия
                  </MenuItem>
                  <MenuItem value="manual">Конкретные службы</MenuItem>
                </TextField>
                {manualServices && (
                  <ServerSelect
                    label="Добавить службу"
                    value={serviceChoice}
                    queryKey={["generation-services"]}
                    load={async (q, signal) =>
                      (await trainingApi.services(q, signal)).map((s) => ({
                        id: s.id,
                        label: `${s.short_name || s.code} — ${s.name}`,
                      }))
                    }
                    onChange={(v) => {
                      setServiceChoice(null);
                      if (v && !services.some((s) => s.id === v.id))
                        setServices((prev) => [...prev, v]);
                      setRequestId(createUuid());
                    }}
                  />
                )}
              </div>
              {manualServices && (
                <>
                  <Alert severity="warning">
                    Явно выбранные службы имеют приоритет над ЕКП. Пустой список
                    означает «Без оповещения».
                  </Alert>
                  <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
                    {services.map((s) => (
                      <Chip
                        key={s.id}
                        label={s.label}
                        onDelete={() => {
                          setServices((prev) =>
                            prev.filter((item) => item.id !== s.id),
                          );
                          setRequestId(createUuid());
                        }}
                      />
                    ))}
                  </Stack>
                </>
              )}
              {!!features.length && (
                <>
                  <h3>Признаки происшествия</h3>
                  <p>
                    Не выбранное значение — «Случайно». Повторный клик отменяет
                    выбор.
                  </p>
                  <div className="generation-grid">
                    {activeFeatureDefinitions(features, p.feature_answers).map(
                      (feature) => (
                        <div key={feature.key}>
                          <FeatureInput
                            feature={feature}
                            value={p.feature_answers?.[feature.key]}
                            onChange={(value) => {
                              change({
                                feature_answers: updateFeatureAnswer(
                                  features,
                                  p.feature_answers,
                                  feature.key,
                                  value,
                                ),
                              });
                            }}
                          />
                          <Button
                            size="small"
                            onClick={() => {
                              change({
                                feature_answers: updateFeatureAnswer(
                                  features,
                                  p.feature_answers,
                                  feature.key,
                                  undefined,
                                ),
                              });
                            }}
                          >
                            Случайно
                          </Button>
                        </div>
                      ),
                    )}
                  </div>
                </>
              )}
              <h3>Место происшествия</h3>
              <div className="generation-grid">
                {textChoice(
                  "locality",
                  "Населённый пункт",
                  options.data.locality,
                )}
                {textChoice("street", "Улица", options.data.street)}
                {textChoice("house", "Дом", options.data.house)}
                {textChoice("object", "Объект", options.data.object)}
              </div>
              <h3>Заявитель и подача сообщения</h3>
              <div className="generation-grid">
                {(
                  [
                    ["gender", "Пол заявителя"],
                    ["time_of_day", "Время суток"],
                    ["caller_state", "Состояние заявителя"],
                    ["detail_level", "Подробность сообщения"],
                  ] as const
                ).map(([key, title]) => (
                  <TextField
                    key={key}
                    select
                    label={title}
                    value={p[key] ?? "random"}
                    onChange={(e) =>
                      change({
                        [key]:
                          e.target.value === "random" ? null : e.target.value,
                      })
                    }
                  >
                    <MenuItem value="random">Случайно</MenuItem>
                    {options.data![key].map((v) => (
                      <MenuItem key={v.value} value={v.value}>
                        {v.label}
                      </MenuItem>
                    ))}
                  </TextField>
                ))}
                <TextField
                  label="Возраст заявителя"
                  type="number"
                  value={p.age ?? ""}
                  placeholder="Случайно"
                  helperText="Пусто — случайно; от 8 до 95 лет"
                  onChange={(e) =>
                    change({
                      age: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  slotProps={{ htmlInput: { min: 8, max: 95 } }}
                />
                {textChoice(
                  "caller_name",
                  "ФИО заявителя",
                  p.gender
                    ? options.data.caller_name[p.gender]
                    : Object.values(options.data.caller_name).flat(),
                )}
              </div>
              <p>
                Телефоны создаются автоматически как вымышленные учебные номера.
              </p>
            </fieldset>
          )}
        </QueryState>
        {save.error && (
          <Alert severity="error">{getApiError(save.error).message}</Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button disabled={save.isPending} onClick={onClose}>
          Отмена
        </Button>
        <Button
          variant="contained"
          disabled={
            !options.data ||
            save.isPending ||
            !Number.isInteger(count) ||
            count < 1 ||
            count > (options.data?.max_count ?? 10)
          }
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Регистрация…" : "Запустить генерацию"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
