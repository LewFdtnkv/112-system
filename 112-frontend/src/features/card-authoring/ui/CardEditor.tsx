import { cardFlagFields } from "@/entities/incident-card";
import { trainingApi, type FeatureDefinition } from "@/entities/training";
import { getApiError } from "@/shared/api";
import {
  activeFeatureDefinitions,
  updateFeatureAnswer,
} from "@/shared/lib/featureValues";
import { FeatureInput } from "@/shared/ui/FeatureInput";
import { QueryState } from "@/shared/ui/QueryState";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Stack,
  TextField,
  MenuItem,
} from "@mui/material";
import { styles } from "../styles/CardEditor";
import { TemplateAddress } from "./TemplateAddress";
import { useCardEditor } from "../model/useCardEditor";
import type { CardEditorProps } from "../types/CardEditor";

export function CardEditor({ onClose, initial, onReload }: CardEditorProps) {
  const {
    flags,
    setFlag,
    silent,
    address,
    setAddress,
    person,
    setPerson,
    victims,
    setVictims,
    structuredAddress,
    version,
    setVersion,
    entry,
    setEntry,
    notificationRequired,
    setNotificationRequired,
    features,
    setFeatures,
    answers,
    setAnswers,
    manualRecipients,
    setManualRecipients,
    optional,
    setOptional,
    form,
    setForm,
    routes,
    recipients,
    save,
    labels,
    phoneRef,
    callerPhone,
  } = useCardEditor({ onClose, initial });
  const renderFields = (keys: string[]) =>
    Object.entries(labels)
      .filter(([key]) => keys.includes(key))
      .map(([key, label]) => (
        <TextField
          key={key}
          label={label}
          disabled={silent && ["caller_name", "address_text"].includes(key)}
          required={
            !(key === "address_text" && (!notificationRequired || silent)) &&
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
        if (callerPhone.invalid) {
          callerPhone.reveal();
          phoneRef.current?.focus();
          return;
        }
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
        <h4>Отметки над типом происшествия</h4>
        <p>
          Укажите эти обстоятельства в условии. «Не оценивать» оставляет отметку
          вне автопроверки.
        </p>
        <div className="template-input-grid">
          {cardFlagFields.map(({ key, label }) => (
            <TextField
              key={key}
              select
              label={label}
              disabled={silent && key !== "noContact" && key !== "callDropped"}
              value={flags[key] == null ? "unset" : String(flags[key])}
              onChange={(e) =>
                setFlag(
                  key,
                  e.target.value === "unset"
                    ? undefined
                    : e.target.value === "true",
                )
              }
            >
              <MenuItem value="unset">Не оценивать</MenuItem>
              <MenuItem value="true">Да</MenuItem>
              <MenuItem value="false">Нет</MenuItem>
            </TextField>
          ))}
        </div>
        {silent && (
          <Alert severity="info">
            Молчаливый вызов сохраняется без типа, адреса, личности заявителя,
            числа пострадавших и служб. В условии опишите тишину и наблюдения
            оператора. Неизвестные признаки не участвуют в оценке.
          </Alert>
        )}
        <h4>Заявитель и содержание обращения</h4>
        <div className="template-input-grid">
          {renderFields(["caller_name"])}
          <TextField
            label={labels.caller_phone}
            type="tel"
            autoComplete="off"
            placeholder="+7 900 123-45-67"
            value={form.caller_phone}
            onChange={callerPhone.inputProps.onChange}
            onBlur={callerPhone.inputProps.onBlur}
            inputRef={phoneRef}
            error={callerPhone.issue !== null}
            helperText={callerPhone.issue?.message}
            slotProps={{ htmlInput: { inputMode: "tel", spellCheck: false } }}
          />
        </div>
        {renderFields(["description"])}

        <Alert severity="info">
          Параметры человека необязательны. Укажите существенные сведения также
          в сообщении заявителя, чтобы ученик не оценивался по скрытым фактам.
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
              disabled={silent}
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
          disabled={silent}
          multiline
          value={person.appearance}
          onChange={(e) => setPerson({ ...person, appearance: e.target.value })}
          slotProps={{ htmlInput: { maxLength: 2000 } }}
        />
        {!silent && <TemplateAddress value={address} onChange={setAddress} />}
        {renderFields(["address_text"])}
        <h4>Происшествие и службы</h4>
        <TextField
          disabled={silent}
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
          disabled={!version || silent}
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
        {!silent &&
          activeFeatureDefinitions(features, answers).map((f) => (
            <FeatureInput
              key={f.key}
              feature={f}
              value={answers[f.key]}
              onChange={(value) => {
                setAnswers(
                  updateFeatureAnswer(features, answers, f.key, value),
                );
              }}
            />
          ))}
        {!silent && entry && (
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
        {!silent && manualRecipients !== null && (
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
            <Stack direction="row" sx={styles.stack}>
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
        {!silent && entry && manualRecipients === null && (
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
            (!entry && !silent) ||
            (manualRecipients === null &&
              !silent &&
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
