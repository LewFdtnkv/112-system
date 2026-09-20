import "./cards.scss";
import { TrainingCardPreview } from "@/widgets/incident-card";
import type { ReferenceCardSource } from "@/features/incident-editing";
import { FeatureInput } from "@/shared/ui/FeatureInput";
import { matchesFeature } from "@/shared/lib/featureValues";
import type { FeatureValue } from "@/shared/lib/featureValues";
import { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  trainingApi,
  CardDataFields,
  type FeatureDefinition,
} from "@/entities/training";
import { emptyIncidentAddress, formatAddress } from "@/entities/incident-card";
import { TemplateAddress } from "./TemplateAddress";
import { getApiError } from "@/shared/api";
import { useDebounced } from "@/shared/lib/useDebounced";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryState, PageControls } from "@/shared/ui/QueryState";
import { ServerSelect, type SelectOption } from "@/shared/ui/ServerSelect";
export const CardsPage = () => {
  const [q, setQ] = useState("");
  const search = useDebounced(q);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ReferenceCardSource>();
  const [detailId, setDetailId] = useState<string>();
  const query = useQuery({
    queryKey: ["cards", search, page],
    queryFn: ({ signal }) =>
      trainingApi.cards({ q: search, offset: page * 20 }, signal),
  });
  const detail = useQuery({
    queryKey: ["card", detailId],
    queryFn: ({ signal }) => trainingApi.card(detailId!, signal),
    enabled: !!detailId,
  });
  return (
    <Stack spacing={2}>
      <PageHeader title="Библиотека карточек" />
      {preview && (
        <TrainingCardPreview
          reference={preview}
          onClose={() => setPreview(undefined)}
        />
      )}
      <Button onClick={() => setOpen(true)}>Создать карточку</Button>
      <TextField
        label="Поиск карточки"
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
            <Table aria-label="Библиотека карточек">
              <TableHead>
                <TableRow>
                  <TableCell>Название</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Button
                        className="table-block-link"
                        onClick={() => setDetailId(c.id)}
                      >
                        {c.title}
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
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>Новая учебная карточка</DialogTitle>
        <DialogContent>
          <CardCreate onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!detailId}
        onClose={() => setDetailId(undefined)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>{detail.data?.title ?? "Карточка"}</DialogTitle>
        <DialogContent>
          <QueryState
            pending={detail.isPending}
            error={detail.error}
            retry={() => void detail.refetch()}
          >
            {detail.data && (
              <div className="template-detail">
                <aside className="template-condition">
                  <h3>Условие для ученика</h3>
                  <p className="template-message">
                    {detail.data.caller_message}
                  </p>
                  <h4>Инструкция</h4>
                  <p>
                    {detail.data.instructions || "Дополнительных указаний нет"}
                  </p>
                  <small>Эти сведения доступны ученику во время задания.</small>
                </aside>
                <section
                  className="template-solution"
                  aria-label="Эталонное решение"
                >
                  <div className="template-solution-heading">
                    <h3>Эталонное решение</h3>
                    <Button onClick={() => setPreview(detail.data!)}>
                      Открыть в АРМ
                    </Button>
                  </div>
                  <p className="template-explanation">
                    Образец для сравнения. Другая формулировка может быть
                    корректной; смысловые поля проверяются отдельно.
                  </p>
                  <div className="template-routing">
                    <b>Тип происшествия</b>
                    <p>
                      {detail.data.classifier_entry?.display_name ||
                        detail.data.classifier_entry?.name ||
                        "Тип не загружен"}
                    </p>
                    <b>Службы</b>
                    <ul>
                      {detail.data.recipients?.length ? (
                        detail.data.recipients.map((service) => (
                          <li key={service.service_id}>
                            {service.short_name && (
                              <strong>{service.short_name} · </strong>
                            )}
                            {service.name}
                          </li>
                        ))
                      ) : (
                        <li>Без оповещения служб</li>
                      )}
                    </ul>
                  </div>
                  <CardDataFields
                    data={detail.data.data}
                    features={
                      detail.data.classifier_entry?.conditions.features as
                        FeatureDefinition[] | undefined
                    }
                  />
                </section>
              </div>
            )}
          </QueryState>
          <Button onClick={() => setDetailId(undefined)}>Закрыть</Button>
        </DialogContent>
      </Dialog>
    </Stack>
  );
};
function CardCreate({ onClose }: { onClose: () => void }) {
  const [address, setAddress] = useState({ ...emptyIncidentAddress });
  const [person, setPerson] = useState({
    gender: "",
    age: "",
    height_cm: "",
    weight_kg: "",
    appearance: "",
  });
  const [victims, setVictims] = useState("");
  const structuredAddress = formatAddress(address);
  const client = useQueryClient();
  const [version, setVersion] = useState<SelectOption | null>(null);
  const [entry, setEntry] = useState<SelectOption | null>(null);
  const [notificationRequired, setNotificationRequired] = useState(true);
  const [features, setFeatures] = useState<FeatureDefinition[]>([]);
  const [answers, setAnswers] = useState<Record<string, FeatureValue>>({});
  const [manualRecipients, setManualRecipients] = useState<
    SelectOption[] | null
  >(null);
  const [optional, setOptional] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: "",
    caller_message: "",
    instructions: "",
    address_text: "",
    description: "",
    caller_name: "",
    caller_phone: "",
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
    mutationFn: () =>
      trainingApi.createCard({
        title: form.title,
        caller_message: form.caller_message,
        instructions: form.instructions,
        classifier_version_id: version!.id,
        classifier_entry_id: entry!.id,
        recipient_service_ids: manualRecipients?.map((s) => s.id) ?? recipients,
        use_recommended_recipients: manualRecipients === null,
        data: {
          address_text: structuredAddress || form.address_text,
          address_details: Object.fromEntries(
            Object.entries(address).filter(([, value]) => value?.trim()),
          ),
          features: {
            ...(victims === "" ? {} : { victimsCount: Number(victims) }),
            ekp: answers,
          },
          description: form.description,
          caller_details: Object.fromEntries(
            Object.entries(person)
              .filter(([, v]) => v !== "")
              .map(([k, v]) => [
                k,
                ["age", "height_cm", "weight_kg"].includes(k) ? Number(v) : v,
              ]),
          ),
          caller_name: form.caller_name,
          caller_phone: form.caller_phone,
          additional_fields: {},
        },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["cards"] });
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
        {features.map((f) => (
          <FeatureInput
            key={f.key}
            feature={f}
            value={answers[f.key]}
            onChange={(value) => {
              const next = { ...answers };
              if (value === undefined) delete next[f.key];
              else next[f.key] = value;
              setAnswers(next);
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
          <Alert severity="error">{getApiError(save.error).message}</Alert>
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
          Сохранить карточку
        </Button>
        <Button onClick={onClose} disabled={save.isPending}>
          Отмена
        </Button>
      </Stack>
    </Stack>
  );
}
