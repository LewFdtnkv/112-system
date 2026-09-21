import { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Stack,
  TextField,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  trainingApi,
  type FeatureDefinition,
  type CardTemplate,
  type CardTemplateInput,
} from "@/entities/training";
import { emptyIncidentAddress, formatAddress } from "@/entities/incident-card";
import { FeatureInput } from "@/shared/ui/FeatureInput";
import {
  activeFeatureDefinitions,
  updateFeatureAnswer,
  matchesFeature,
  type FeatureValue,
} from "@/shared/lib/featureValues";
import { getApiError } from "@/shared/api";
import { QueryState } from "@/shared/ui/QueryState";
import { ServerSelect, type SelectOption } from "@/shared/ui/ServerSelect";
import { TemplateAddress } from "./TemplateAddress";

export function CardEditor({
  onClose,
  initial,
  onReload,
}: {
  onClose: () => void;
  initial?: CardTemplate;
  onReload?: () => void;
}) {
  const [address, setAddress] = useState({
    ...emptyIncidentAddress,
    ...Object.fromEntries(
      Object.entries(initial?.data.address_details ?? {}).filter(
        ([, v]) => typeof v === "string",
      ),
    ),
  });
  const [person, setPerson] = useState({
    gender: String(initial?.data.caller_details?.gender ?? ""),
    age: String(initial?.data.caller_details?.age ?? ""),
    height_cm: String(initial?.data.caller_details?.height_cm ?? ""),
    weight_kg: String(initial?.data.caller_details?.weight_kg ?? ""),
    appearance: String(initial?.data.caller_details?.appearance ?? ""),
  });
  const [victims, setVictims] = useState(
    String(initial?.data.features?.victimsCount ?? ""),
  );
  const structuredAddress = formatAddress(address);
  const client = useQueryClient();
  const [version, setVersion] = useState<SelectOption | null>(
    initial
      ? { id: initial.classifier_version_id, label: initial.classifier_label }
      : null,
  );
  const [entry, setEntry] = useState<SelectOption | null>(
    initial?.classifier_entry
      ? {
          id: initial.classifier_entry_id,
          label: `${initial.classifier_entry.code} — ${initial.classifier_entry.name}`,
        }
      : null,
  );
  const [notificationRequired, setNotificationRequired] = useState(
    initial?.classifier_entry?.notification_required !== false,
  );
  const [features, setFeatures] = useState<FeatureDefinition[]>(
    (initial?.classifier_entry?.conditions.features ??
      []) as FeatureDefinition[],
  );
  const [answers, setAnswers] = useState<Record<string, FeatureValue>>(
    (initial?.data.features?.ekp ?? {}) as Record<string, FeatureValue>,
  );
  const [manualRecipients, setManualRecipients] = useState<
    SelectOption[] | null
  >(
    initial
      ? (initial.recipients ?? []).map((s) => ({
          id: s.service_id,
          label: s.name,
        }))
      : null,
  );
  const [optional, setOptional] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    caller_message: initial?.caller_message ?? "",
    instructions: initial?.instructions ?? "",
    address_text: initial?.data.address_text ?? "",
    description: initial?.data.description ?? "",
    caller_name: initial?.data.caller_name ?? "",
    caller_phone: initial?.data.caller_phone ?? "",
  });
  const routes = useQuery({
    queryKey: ["routes", version?.id, entry?.id],
    queryFn: ({ signal }) => trainingApi.routes(version!.id, entry!.id, signal),
    enabled: !!version && !!entry,
  });
  const recipients = (routes.data ?? [])
    .filter(
      (r) =>
        !Object.keys(r.conditions).length ||
        (features.length
          ? Object.entries(
              (r.conditions.when ?? {}) as Record<string, FeatureValue>,
            ).every(([key, v]) => matchesFeature(answers[key], v))
          : optional.includes(r.service_id)),
    )
    .map((r) => r.service_id);
  const save = useMutation({
    mutationFn: () => {
      const body: CardTemplateInput = {
        title: form.title,
        caller_message: form.caller_message.trim() ? form.caller_message : null,
        instructions: form.instructions,
        classifier_version_id: version!.id,
        classifier_entry_id: entry!.id,
        recipient_service_ids: manualRecipients?.map((s) => s.id) ?? recipients,
        use_recommended_recipients: manualRecipients === null,
        data: {
          ...initial?.data,
          address_text: structuredAddress || form.address_text,
          address_details: Object.fromEntries(
            Object.entries(address).filter(([, value]) => value?.trim()),
          ),
          features: {
            ...initial?.data.features,
            victimsCount: victims === "" ? null : Number(victims),
            ekp: answers,
          },
          description: form.description,
          caller_details: {
            ...initial?.data.caller_details,
            ...Object.fromEntries(
              Object.entries(person).map(([k, v]) => [
                k,
                v === ""
                  ? null
                  : ["age", "height_cm", "weight_kg"].includes(k)
                    ? Number(v)
                    : v,
              ]),
            ),
          },
          caller_name: form.caller_name,
          caller_phone: form.caller_phone,
          additional_fields: initial?.data.additional_fields ?? {},
        },
      };
      return initial
        ? trainingApi.updateCard(initial.id, {
            ...body,
            revision: initial.revision,
          })
        : trainingApi.createCard(body);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["cards"] });
      void client.invalidateQueries({ queryKey: ["card", initial?.id] });
      void client.invalidateQueries({ queryKey: ["card-options"] });
      onClose();
    },
  });
  const labels = {
    title: "Название карточки",
    caller_message: "Сообщение заявителя для ученика",
    instructions: "Инструкция ученику",
    address_text: "Адрес целиком",
    description: "Сообщение в карточке",
    caller_name: "ФИО заявителя",
    caller_phone: "Телефон заявителя",
  };
  const renderFields = (keys: string[]) =>
    Object.entries(labels)
      .filter(([key]) => keys.includes(key))
      .map(([key, label]) => (
        <TextField
          key={key}
          label={label}
          required={
            !(key === "address_text" && !notificationRequired) &&
            !(key === "caller_message" && initial) &&
            ["title", "caller_message", "address_text", "description"].includes(
              key,
            )
          }
          multiline={["caller_message", "instructions", "description"].includes(
            key,
          )}
          minRows={key === "caller_message" ? 3 : 1}
          value={
            key === "address_text"
              ? structuredAddress || form.address_text
              : form[key as keyof typeof form]
          }
          slotProps={{
            input: { readOnly: key === "address_text" && !!structuredAddress },
          }}
          helperText={
            key === "address_text" && structuredAddress
              ? "Собран из отдельных полей адреса ниже."
              : undefined
          }
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      ));
  return (
    <Stack
      component="form"
      className="template-editor"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <aside className="template-condition">
        <h3>Условие для ученика</h3>
        {renderFields(["title", "caller_message", "instructions"])}
        <p className="template-explanation">
          Укажите здесь все факты, необходимые для решения. Ученик не видит
          эталонное решение.
        </p>
      </aside>
      <section className="template-solution">
        <h3>Эталонное решение</h3>
        <p className="template-explanation">
          Заполняйте только известные из условия сведения. Пустое необязательное
          поле не считается ошибкой ученика.
        </p>
        <h4>Заявитель и содержание обращения</h4>
        <div className="template-input-grid">
          {renderFields(["caller_name", "caller_phone"])}
        </div>
        {renderFields(["description"])}

        <Alert severity="info">
          Параметры человека необязательны. Укажите существенные сведения также
          в сообщении заявителя, чтобы ученик не оценивался по скрытым фактам.
          Генерация ИИ будет подключена отдельно.
        </Alert>
        <Stack direction="row" spacing={1}>
          {(
            [
              ["gender", "Пол"],
              ["age", "Возраст"],
              ["height_cm", "Рост, см"],
              ["weight_kg", "Вес, кг"],
            ] as const
          ).map(([key, label]) => (
            <TextField
              key={key}
              label={label}
              type={key === "gender" ? "text" : "number"}
              value={person[key]}
              onChange={(e) => setPerson({ ...person, [key]: e.target.value })}
              slotProps={{
                htmlInput: {
                  min: 0,
                  max: key === "age" ? 130 : 600,
                  maxLength: 40,
                },
              }}
            />
          ))}
        </Stack>
        <TextField
          label="Внешность и особые приметы"
          multiline
          value={person.appearance}
          onChange={(e) => setPerson({ ...person, appearance: e.target.value })}
          slotProps={{ htmlInput: { maxLength: 2000 } }}
        />
        <TemplateAddress value={address} onChange={setAddress} />
        {renderFields(["address_text"])}
        <h4>Происшествие и службы</h4>
        <TextField
          label="Количество пострадавших"
          type="number"
          value={victims}
          onChange={(e) => setVictims(e.target.value)}
          slotProps={{ htmlInput: { min: 0, max: 100000, step: 1 } }}
          helperText="Оставьте пустым, если в условии не указано. Ноль означает, что пострадавших нет."
        />
        <ServerSelect
          label="Опубликованная версия ЕКП"
          queryKey={["classifier-options"]}
          value={version}
          onChange={(v) => {
            setVersion(v);
            setEntry(null);
            setNotificationRequired(true);
            setFeatures([]);
            setAnswers({});
            setOptional([]);
            setManualRecipients(null);
          }}
          load={async (q, signal) =>
            (await trainingApi.classifiers(q, signal)).map((c) => ({
              id: c.id,
              label: c.label,
            }))
          }
        />
        <ServerSelect
          label="Тип происшествия (ЕКП)"
          queryKey={["entry-options-with-features", version?.id]}
          disabled={!version}
          value={entry}
          onChange={(v) => {
            setEntry(v);
            const metadata = v?.metadata as
              | {
                  features?: FeatureDefinition[];
                  notification_required?: boolean;
                }
              | undefined;
            setFeatures(metadata?.features ?? []);
            setNotificationRequired(metadata?.notification_required !== false);
            setAnswers({});
            setOptional([]);
            setManualRecipients(null);
          }}
          load={async (q, signal) => {
            const rows = await trainingApi.entries(version!.id, { q }, signal);
            return rows.map((c) => ({
              id: c.id,
              label: `${c.code} — ${c.name}`,
              metadata: {
                features: c.conditions.features ?? [],
                notification_required: c.notification_required,
              },
            }));
          }}
        />
        {activeFeatureDefinitions(features, answers).map((f) => (
          <FeatureInput
            key={f.key}
            feature={f}
            value={answers[f.key]}
            onChange={(value) => {
              setAnswers(updateFeatureAnswer(features, answers, f.key, value));
            }}
          />
        ))}
        {entry && (
          <FormControlLabel
            label="Задать службы эталонного решения вручную"
            control={
              <Checkbox
                checked={manualRecipients !== null}
                onChange={(_, checked) =>
                  setManualRecipients(
                    checked
                      ? (routes.data ?? [])
                          .filter((r) => recipients.includes(r.service_id))
                          .map((r) => ({
                            id: r.service_id,
                            label: r.service_name,
                          }))
                      : null,
                  )
                }
              />
            }
          />
        )}
        {manualRecipients !== null && (
          <Stack spacing={1}>
            {initial && (
              <Alert severity="info">
                Показан сохранённый список служб. Чтобы пересчитать его по ЕКП,
                снимите флажок ручного выбора.
              </Alert>
            )}
            <Alert severity="info">
              Используйте для исключений из ЕКП. Укажите причину и сведения для
              решения в условии карточки. Ученик будет оцениваться по этому
              списку; пустой список означает регистрацию без оповещения.
            </Alert>
            <ServerSelect
              label="Добавить службу в эталонное решение"
              queryKey={["reference-services"]}
              value={null}
              onChange={(v) => {
                if (v && !manualRecipients.some((s) => s.id === v.id))
                  setManualRecipients([...manualRecipients, v]);
              }}
              load={async (q, signal) =>
                (await trainingApi.services(q, signal)).map((s) => ({
                  id: s.id,
                  label: s.name,
                }))
              }
            />
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
              {manualRecipients.map((s) => (
                <Chip
                  key={s.id}
                  label={s.label}
                  onDelete={() =>
                    setManualRecipients(
                      manualRecipients.filter((x) => x.id !== s.id),
                    )
                  }
                />
              ))}
            </Stack>
          </Stack>
        )}
        {entry && manualRecipients === null && (
          <QueryState
            pending={routes.isPending}
            error={routes.error}
            retry={() => void routes.refetch()}
          >
            {routes.data?.map((r) => (
              <FormControlLabel
                key={r.service_id}
                label={
                  r.service_name +
                  (Object.keys(r.conditions).length
                    ? " (условный маршрут)"
                    : "")
                }
                control={
                  <Checkbox
                    checked={recipients.includes(r.service_id)}
                    disabled={
                      features.length > 0 || !Object.keys(r.conditions).length
                    }
                    onChange={(_, checked) =>
                      setOptional(
                        checked
                          ? [...optional, r.service_id]
                          : optional.filter((id) => id !== r.service_id),
                      )
                    }
                  />
                }
              />
            ))}
          </QueryState>
        )}
        {!features.length &&
          routes.data?.some((r) => Object.keys(r.conditions).length > 0) && (
            <Alert severity="warning">
              Выполнение учеником условных маршрутов пока недоступно.
            </Alert>
          )}
        {save.error && (
          <Alert
            severity="error"
            action={
              initial && onReload ? (
                <Button onClick={onReload}>
                  Загрузить актуальную карточку
                </Button>
              ) : undefined
            }
          >
            {getApiError(save.error).message}
          </Alert>
        )}
      </section>
      <Stack className="template-editor-actions" direction="row" spacing={2}>
        <Button
          type="submit"
          disabled={
            save.isPending ||
            !version ||
            !entry ||
            (manualRecipients === null &&
              notificationRequired &&
              !recipients.length) ||
            routes.isFetching
          }
        >
          {initial ? "Сохранить изменения" : "Сохранить карточку"}
        </Button>
        <Button onClick={onClose} disabled={save.isPending}>
          Отмена
        </Button>
      </Stack>
    </Stack>
  );
}
