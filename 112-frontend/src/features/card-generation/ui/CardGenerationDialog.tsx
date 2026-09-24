import { cardFlagFields } from "@/entities/incident-card";
import { trainingApi, type FeatureDefinition } from "@/entities/training";
import { getApiError } from "@/shared/api";
import {
  activeFeatureDefinitions,
  updateFeatureAnswer,
} from "@/shared/lib/featureValues";
import { randomUUID as createUuid } from "@/shared/lib/uuid";
import { FeatureInput } from "@/shared/ui/FeatureInput";
import { QueryState } from "@/shared/ui/QueryState";
import { ServerSelect, type SelectOption } from "@/shared/ui/ServerSelect";
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
import { useCardGeneration } from "../model/useCardGeneration";
import { styles } from "../styles/CardGenerationDialog";
import "../styles/generation.scss";
import type { CardGenerationDialogProps } from "../types/CardGenerationDialog";

const random: SelectOption = { id: "", label: "Случайно" };
export function CardGenerationDialog({ onClose }: CardGenerationDialogProps) {
  const {
    count,
    setCount,
    setRequestId,
    p,
    version,
    setVersion,
    entry,
    setEntry,
    services,
    setServices,
    serviceChoice,
    setServiceChoice,
    manualServices,
    setManualServices,
    features,
    setFeatures,
    options,
    change,
    save,
  } = useCardGeneration({ onClose });
  const textChoice = (
    key: "locality" | "street" | "house" | "object" | "caller_name",
    label: string,
    values: string[],
  ) => (
    <Autocomplete
      key={key}
      disabled={
        (key === "caller_name" && p.caller_information === "anonymous") ||
        (key === "house" &&
          (p.address_format === "descriptive" || !!p.address_description))
      }
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
      <DialogTitle id="generation-title">Сгенерировать карточки</DialogTitle>
      <DialogContent>
        <QueryState
          pending={options.isPending}
          error={options.error}
          retry={() => void options.refetch()}
        >
          {options.data && (
            <fieldset className="generation-form" disabled={save.isPending}>
              <Alert severity="info">
                Выбираем совместимый сюжет из {options.data.template_count}{" "}
                заготовок. «Случайно» меняет параметры для каждой карточки. ИИ
                выбирает формулировки, сохраняя факты. Готовые материалы
                проверьте перед добавлением в сценарий.
              </Alert>
              <TextField
                select
                label="Способ подготовки"
                value={p.mode ?? "assisted"}
                onChange={(e) =>
                  change({ mode: e.target.value as "assisted" | "template" })
                }
                helperText="Если ИИ недоступен, используем текст заготовки и отметим это в карточке."
              >
                <MenuItem value="assisted">
                  Заготовка + подбор формулировок ИИ
                </MenuItem>
                <MenuItem value="template">Заготовка без ИИ — быстро</MenuItem>
              </TextField>
              <Alert severity="info">
                Поддерживаемые типы: {options.data.supported_types?.join(", ")}.
                Для остальных типов пока используйте ручное создание.
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
                  <Stack direction="row" sx={styles.stack}>
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
              <h3>Отметки карточки</h3>
              <p>
                Значения выбираются до обращения к ИИ и входят в эталонное
                решение.
              </p>
              <div className="generation-grid">
                {cardFlagFields.map(({ parameter, label }) => {
                  if (
                    parameter === "no_contact" ||
                    parameter === "call_dropped"
                  )
                    return null;
                  return (
                    <TextField
                      key={parameter}
                      select
                      label={label}
                      value={
                        p[parameter] == null ? "random" : String(p[parameter])
                      }
                      onChange={(e) =>
                        change({
                          [parameter]:
                            e.target.value === "random"
                              ? null
                              : e.target.value === "true",
                        })
                      }
                    >
                      <MenuItem value="random">Случайно</MenuItem>
                      <MenuItem value="true">Да</MenuItem>
                      <MenuItem value="false">Нет</MenuItem>
                    </TextField>
                  );
                })}
                <TextField
                  label="Количество пострадавших"
                  type="number"
                  value={p.victims_count ?? ""}
                  placeholder="Случайно"
                  helperText="Пусто — случайно; 0 — пострадавших нет"
                  slotProps={{ htmlInput: { min: 0, max: 100000, step: 1 } }}
                  onChange={(e) =>
                    change({
                      victims_count:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
              <Alert severity="info">
                Молчаливые вызовы и обрыв связи пока не генерируются.
              </Alert>
              <h3>Место происшествия</h3>
              <TextField
                select
                label="Формат адреса"
                value={p.address_format ?? "random"}
                onChange={(e) =>
                  change({
                    address_format:
                      e.target.value === "random"
                        ? null
                        : (e.target.value as "structured" | "descriptive"),
                  })
                }
              >
                <MenuItem value="random">Случайно</MenuItem>
                {options.data.address_format.map((v) => (
                  <MenuItem key={v.value} value={v.value}>
                    {v.label}
                  </MenuItem>
                ))}
              </TextField>
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
              <TextField
                label="Описательный адрес — ориентиры"
                multiline
                minRows={2}
                value={p.address_description ?? ""}
                disabled={p.address_format === "structured" || !!p.house}
                placeholder="Случайный ориентир из заготовок"
                helperText="Например: за остановкой, рядом с зелёным ограждением. Номер дома не выдумывается."
                onChange={(e) =>
                  change({ address_description: e.target.value || null })
                }
                slotProps={{ htmlInput: { maxLength: 200 } }}
              />
              <h3>Заявитель и подача сообщения</h3>
              <div className="generation-grid">
                {(
                  [
                    ["message_format", "Формат сообщения"],
                    ["caller_information", "Сведения о заявителе"],
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
                    disabled={
                      key === "gender" &&
                      (p.caller_information === "anonymous" ||
                        p.caller_information === "name_only")
                    }
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
                  disabled={
                    p.caller_information === "anonymous" ||
                    p.caller_information === "name_only"
                  }
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
                СМС по умолчанию не содержит ФИО, пола, возраста и телефона. Для
                телефонного сообщения номер АОН вымышленный учебный. Неизвестные
                сведения не входят в эталонное решение.
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
