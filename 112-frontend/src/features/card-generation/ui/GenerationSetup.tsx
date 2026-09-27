import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import type { FeatureDefinition } from "@/entities/training";
import { catalogLookupApi } from "@/entities/catalog";
import { randomUUID as createUuid } from "@/shared/lib/uuid";
import { ServerSelect, type SelectOption } from "@/shared/ui/ServerSelect";
import { Alert, Chip, MenuItem, Stack } from "@mui/material";
import { styles } from "../styles/CardGenerationDialog";
import type { CardGenerationPanelProps } from "../types/CardGenerationPanels";

const random: SelectOption = { id: "", label: "Случайно" };

export function GenerationSetup({ model }: CardGenerationPanelProps) {
  const { options, p } = model;
  const data = options.data!;
  return (
    <>
      <Alert severity="info">
        Выбираем совместимый сюжет из {data.template_count} заготовок.
        «Случайно» меняет параметры для каждой карточки. ИИ пишет сообщение
        заявителя, затем отдельно проверяет его по заданным фактам. Ваши
        отмеченные карточки служат примерами речи. Готовые материалы проверьте
        перед добавлением в сценарий.
      </Alert>
      <TextField
        name="parameters.mode"
        select
        label="Способ подготовки"
        value={p.mode ?? "assisted"}
        onChange={(e) =>
          model.change({ mode: e.target.value as "assisted" | "template" })
        }
        helperText="Если текст не прошёл проверку или ИИ недоступен, используем заготовку и отметим это в карточке."
      >
        <MenuItem value="assisted">
          Живое сообщение ИИ + проверка фактов
        </MenuItem>
        <MenuItem value="template">Заготовка без ИИ — быстро</MenuItem>
      </TextField>
      <Alert severity="info">
        Поддерживаемые типы: {data.supported_types?.join(", ")}. Для остальных
        типов пока используйте ручное создание.
      </Alert>
      <TextField
        name="count"
        required
        label="Количество карточек"
        type="number"
        value={model.count}
        onChange={(e) => {
          model.setCount(Number(e.target.value));
          model.setRequestId(createUuid());
        }}
        slotProps={{ htmlInput: { min: 1, max: data.max_count } }}
        helperText={`От 1 до ${data.max_count}; генерация идёт по очереди`}
      />
      <h3>Происшествие и службы</h3>
      <div className="generation-grid">
        <ServerSelect
          name="parameters.classifier_version_id"
          label="Версия ЕКП"
          value={model.version}
          queryKey={["generation-classifiers"]}
          load={async (q, signal) => [
            random,
            ...(await catalogLookupApi.classifiers(q, signal)).map((v) => ({
              id: v.id,
              label: v.label,
            })),
          ]}
          onChange={(v) => {
            model.setVersion(v ?? random);
            model.setEntry(random);
            model.setFeatures([]);
            model.change({ feature_answers: {} });
          }}
        />
        <ServerSelect
          name="parameters.classifier_entry_id"
          label="Тип происшествия"
          value={model.entry}
          disabled={!model.version?.id}
          queryKey={["generation-entries", model.version?.id]}
          load={async (q, signal) => [
            random,
            ...(await catalogLookupApi.entries(model.version!.id, { q }, signal)).map(
              (v) => ({
                id: v.id,
                label: v.display_name || v.name,
                metadata: v.conditions.features,
              }),
            ),
          ]}
          onChange={(v) => {
            model.setEntry(v ?? random);
            model.setFeatures((v?.metadata ?? []) as FeatureDefinition[]);
            model.change({ feature_answers: {} });
          }}
        />
        <TextField
          select
          label="Службы для оповещения"
          value={model.manualServices ? "manual" : "random"}
          onChange={(e) => {
            model.setManualServices(e.target.value === "manual");
            model.setRequestId(createUuid());
          }}
        >
          <MenuItem value="random">
            Случайно · по ЕКП выбранного происшествия
          </MenuItem>
          <MenuItem value="manual">Конкретные службы</MenuItem>
        </TextField>
        {model.manualServices && (
          <ServerSelect
            label="Добавить службу"
            value={model.serviceChoice}
            queryKey={["generation-services"]}
            load={async (q, signal) =>
              (await catalogLookupApi.services(q, signal)).map((s) => ({
                id: s.id,
                label: `${s.short_name || s.code} — ${s.name}`,
              }))
            }
            onChange={(v) => {
              model.setServiceChoice(null);
              if (v && !model.services.some((s) => s.id === v.id))
                model.setServices((prev) => [...prev, v]);
              model.setRequestId(createUuid());
            }}
          />
        )}
      </div>
      {model.manualServices && (
        <>
          <Alert severity="warning">
            Явно выбранные службы имеют приоритет над ЕКП. Пустой список
            означает «Без оповещения».
          </Alert>
          <Stack direction="row" sx={styles.stack}>
            {model.services.map((service) => (
              <Chip
                key={service.id}
                label={service.label}
                onDelete={() => {
                  model.setServices((prev) =>
                    prev.filter((item) => item.id !== service.id),
                  );
                  model.setRequestId(createUuid());
                }}
              />
            ))}
          </Stack>
        </>
      )}
    </>
  );
}
