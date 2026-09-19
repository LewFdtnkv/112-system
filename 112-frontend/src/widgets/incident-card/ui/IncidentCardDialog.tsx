import CloseIcon from "@mui/icons-material/Close";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";
import { useEffect, useState } from "react";

import {
  getMissingCardFields,
  incidentCategories,
  getIncidentTagGroups,
  incidentStatusLabels,
  incidentStatuses,
  readCardDraft,
  responseServices,
  writeCardDraft,
  type IncidentAddress,
  type IncidentCard,
  type IncidentCardFields,
  type IncidentPhones,
  type IncidentStatus,
  type ResponseService,
} from "@/entities/incident-card";
import { formatDuration } from "@/shared/lib/formatDuration";
import { LocationMap } from "@/widgets/location-map-placeholder";

interface IncidentCardDialogProps {
  card: IncidentCard | null;
  sessionId?: string;
  log: readonly string[];
  isSubmitted: boolean;
  isCallAccepted: boolean;
  elapsedSeconds: number;
  /** Норматив заполнения карточки, сек (ТЗ §8, по умолчанию 30). */
  normSeconds: number;
  onClose: () => void;
  /** Зафиксировать действие оператора, не закрывая карточку. */
  onCommitAction: (fields: IncidentCardFields, action: string) => void;
  onSubmit: (fields: IncidentCardFields) => void;
}

const missingFieldLabels: Record<string, string> = {
  categoryId: "тип происшествия",
  address: "адрес (улица и дом)",
  description: "сообщение",
  operatorAction: "действие оператора",
  services: "службы реагирования",
};

export const IncidentCardDialog = ({
  card,
  ...rest
}: IncidentCardDialogProps) => (
  <Dialog
    open={Boolean(card)}
    onClose={rest.onClose}
    fullWidth
    maxWidth="md"
    fullScreen
    className="arm-card-dialog"
  >
    {/* key сбрасывает состояние формы при смене карточки — без синхронизации в эффекте */}
    {card && <IncidentCardForm key={card.id} card={card} {...rest} />}
  </Dialog>
);

type IncidentCardFormProps = Omit<IncidentCardDialogProps, "card"> & {
  card: IncidentCard;
};

const IncidentCardForm = ({
  card,
  sessionId,
  log,
  isSubmitted,
  isCallAccepted,
  elapsedSeconds,
  normSeconds,
  onClose,
  onCommitAction,
  onSubmit,
}: IncidentCardFormProps) => {
  const [fields, setFields] = useState<IncidentCardFields>(() =>
    isSubmitted
      ? card.fields
      : (readCardDraft(sessionId, card.id) ?? card.fields),
  );
  const [error, setError] = useState<string>();
  const [selectedTags, setSelectedTags] = useState<readonly string[]>([]);
  const tagGroups = getIncidentTagGroups(fields.categoryId);

  /** Черновик переживает перезагрузку и кратковременный обрыв связи. */
  useEffect(() => {
    if (!isSubmitted) writeCardDraft(sessionId, card.id, fields);
  }, [card.id, fields, isSubmitted, sessionId]);

  const setField = <Key extends keyof IncidentCardFields>(
    key: Key,
    value: IncidentCardFields[Key],
  ) => {
    setFields((current) => ({ ...current, [key]: value }));
    setError(undefined);
  };

  const setAddressField = <Key extends keyof IncidentAddress>(
    key: Key,
    value: IncidentAddress[Key],
  ) => {
    setFields((current) => ({
      ...current,
      address: { ...current.address, [key]: value },
    }));
    setError(undefined);
  };

  const setPhoneField = <Key extends keyof IncidentPhones>(
    key: Key,
    value: IncidentPhones[Key],
  ) => {
    setFields((current) => ({
      ...current,
      phones: { ...current.phones, [key]: value },
    }));
    setError(undefined);
  };

  const toggleService = (service: ResponseService) =>
    setFields((current) => {
      const services = current.services.includes(service)
        ? current.services.filter((item) => item !== service)
        : [...current.services, service];

      return { ...current, services };
    });

  const setCategory = (categoryId: string) => {
    const category = incidentCategories.find((item) => item.id === categoryId);
    setFields((current) => ({
      ...current,
      categoryId,
      services: category?.defaultServices ?? [],
    }));
    setSelectedTags([]);
    setError(undefined);
  };

  const toggleTag = (tag: string) =>
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag],
    );

  const commitAction = () => {
    if (isSubmitted || !isCallAccepted) return;
    const action = fields.operatorAction.trim();
    if (!action) {
      setError("Опишите действие оператора, прежде чем фиксировать его.");
      return;
    }

    onCommitAction(fields, action);
    setFields({ ...fields, operatorAction: "" });
    setError(undefined);
  };

  const submit = () => {
    if (isSubmitted || !isCallAccepted) return;
    const hasRecordedAction = log.some((entry) =>
      entry.startsWith("Оператор: "),
    );
    const missing = getMissingCardFields(fields).filter(
      (field) => field !== "operatorAction" || !hasRecordedAction,
    );
    if (missing.length > 0) {
      setError(
        `Заполните: ${missing
          .map((field) => missingFieldLabels[field] ?? field)
          .join(", ")}.`,
      );
      return;
    }

    onSubmit(fields);
    setFields({ ...fields, status: "closed" });
    setError(undefined);
  };

  const isOverdue = elapsedSeconds >= normSeconds;
  const addressLine = [
    fields.address.street,
    fields.address.house && `д. ${fields.address.house}`,
    fields.address.building && `корп. ${fields.address.building}`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <DialogTitle>Карточка происшествия № {card.id}</DialogTitle>
      <DialogContent>
        <div className="incident-card-form">
          <div className="arm-card-summary">
            <div>
              <strong>Учебный вызов</strong>
              <span>Соединение установлено · канал {card.channel}</span>
            </div>
            <div>
              <strong>Карточка № {card.id}</strong>
              <span>Время создания: {card.createdAt}</span>
            </div>
            <div>
              <strong>Источник</strong>
              <span>
                {card.origin === "generated"
                  ? "Сгенерирована системой"
                  : "Создана обучающимся"}
              </span>
            </div>
            <div
              className={
                isOverdue
                  ? "arm-card-summary__timer arm-card-summary__timer--overdue"
                  : "arm-card-summary__timer"
              }
            >
              <strong>
                {isOverdue ? "Норматив превышен" : "Время набора"}
              </strong>
              <span aria-label="Время заполнения карточки относительно норматива">
                {formatDuration(elapsedSeconds)} / {formatDuration(normSeconds)}
              </span>
            </div>
          </div>

          <div className="incident-card-form__columns">
            <section
              className="arm-card-panel"
              aria-labelledby="card-contact-title"
            >
              <h2 id="card-contact-title">Сведения о заявителе</h2>
              <div className="arm-card-panel__fields">
                <TextField
                  disabled={isSubmitted || !isCallAccepted}
                  label="Заявитель"
                  value={fields.callerName}
                  onChange={(event) =>
                    setField("callerName", event.target.value)
                  }
                />
                <TextField
                  disabled={isSubmitted || !isCallAccepted}
                  label="Пострадавших"
                  type="number"
                  value={fields.victimsCount ?? ""}
                  onChange={(event) =>
                    setField(
                      "victimsCount",
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                    )
                  }
                />
              </div>
              <div
                className="arm-card-panel__fields"
                aria-label="Телефоны заявителя"
              >
                <TextField
                  disabled={isSubmitted || !isCallAccepted}
                  label="АОН"
                  value={fields.phones.callerId}
                  onChange={(event) =>
                    setPhoneField("callerId", event.target.value)
                  }
                />
                <TextField
                  disabled={isSubmitted || !isCallAccepted}
                  label="Предоставленный"
                  value={fields.phones.provided}
                  onChange={(event) =>
                    setPhoneField("provided", event.target.value)
                  }
                />
                <TextField
                  disabled={isSubmitted || !isCallAccepted}
                  label="Телефон на месте"
                  value={fields.phones.onSite}
                  onChange={(event) =>
                    setPhoneField("onSite", event.target.value)
                  }
                />
              </div>

              <h3 className="arm-card-panel__subheading">Адрес происшествия</h3>
              <div className="arm-card-panel__fields arm-card-panel__fields--address">
                <TextField
                  disabled={isSubmitted || !isCallAccepted}
                  label="Округ"
                  value={fields.address.district}
                  onChange={(event) =>
                    setAddressField("district", event.target.value)
                  }
                />
                <TextField
                  disabled={isSubmitted || !isCallAccepted}
                  label="Район"
                  value={fields.address.area}
                  onChange={(event) =>
                    setAddressField("area", event.target.value)
                  }
                />
                <TextField
                  disabled={isSubmitted || !isCallAccepted}
                  label="Улица"
                  value={fields.address.street}
                  onChange={(event) =>
                    setAddressField("street", event.target.value)
                  }
                />
                <TextField
                  disabled={isSubmitted || !isCallAccepted}
                  label="Дом/Вл"
                  value={fields.address.house}
                  onChange={(event) =>
                    setAddressField("house", event.target.value)
                  }
                />
                <TextField
                  disabled={isSubmitted || !isCallAccepted}
                  label="Корпус/Стр"
                  value={fields.address.building}
                  onChange={(event) =>
                    setAddressField("building", event.target.value)
                  }
                />
                <TextField
                  disabled={isSubmitted || !isCallAccepted}
                  label="Квартира/офис"
                  value={fields.address.apartment}
                  onChange={(event) =>
                    setAddressField("apartment", event.target.value)
                  }
                />
                <TextField
                  disabled={isSubmitted || !isCallAccepted}
                  label="Подъезд"
                  value={fields.address.entrance}
                  onChange={(event) =>
                    setAddressField("entrance", event.target.value)
                  }
                />
                <TextField
                  disabled={isSubmitted || !isCallAccepted}
                  label="Этаж"
                  value={fields.address.floor}
                  onChange={(event) =>
                    setAddressField("floor", event.target.value)
                  }
                />
              </div>
              <TextField
                disabled={isSubmitted || !isCallAccepted}
                label="Описательный адрес"
                placeholder="Например: за ТЦ, второй подъезд со двора"
                value={fields.address.description}
                onChange={(event) =>
                  setAddressField("description", event.target.value)
                }
              />

              <LocationMap addressLine={addressLine} />

              <div className="arm-card-panel__fields">
                <TextField
                  disabled={isSubmitted || !isCallAccepted}
                  select
                  label="Статус обработки"
                  value={fields.status}
                  onChange={(event) =>
                    setField("status", event.target.value as IncidentStatus)
                  }
                >
                  {incidentStatuses.map((status) => (
                    <MenuItem key={status} value={status}>
                      {incidentStatusLabels[status]}
                    </MenuItem>
                  ))}
                </TextField>
              </div>
              <TextField
                disabled={isSubmitted || !isCallAccepted}
                label="Сообщение со слов заявителя"
                multiline
                minRows={5}
                value={fields.description}
                onChange={(event) =>
                  setField("description", event.target.value)
                }
              />
            </section>

            <section
              className="arm-card-panel"
              aria-labelledby="card-scenario-title"
            >
              <h2 id="card-scenario-title">Что случилось</h2>
              <TextField
                disabled={isSubmitted || !isCallAccepted}
                select
                label="Тип происшествия"
                value={fields.categoryId}
                onChange={(event) => setCategory(event.target.value)}
              >
                {incidentCategories.map((category) => (
                  <MenuItem key={category.id} value={category.id}>
                    {category.name}
                  </MenuItem>
                ))}
              </TextField>
              <div
                className="arm-card-tags"
                aria-label="Уточняющие признаки происшествия"
              >
                {tagGroups.map((group) => (
                  <div className="arm-card-tags__group" key={group.label}>
                    <span>{group.label}</span>
                    <div>
                      {group.options.map((tag) => (
                        <button
                          aria-pressed={selectedTags.includes(tag)}
                          className={
                            selectedTags.includes(tag)
                              ? "is-selected"
                              : undefined
                          }
                          disabled={isSubmitted || !isCallAccepted}
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          type="button"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="arm-card-panel__hint">
                После выбора типа службы подбираются автоматически; оператор
                может изменить их ниже.
              </p>
              <TextField
                disabled={isSubmitted || !isCallAccepted}
                label="Действие оператора"
                value={fields.operatorAction}
                placeholder="Например: сообщение принято, дежурная бригада направлена на место"
                multiline
                minRows={4}
                onChange={(event) =>
                  setField("operatorAction", event.target.value)
                }
              />
            </section>
          </div>

          <div className="incident-card-form__log">
            <strong>Журнал действий</strong>
            {log.length > 0 ? (
              <ul>
                {log.map((entry, index) => (
                  <li key={`${index}-${entry}`}>{entry}</li>
                ))}
              </ul>
            ) : (
              <span>Действий пока нет.</span>
            )}
          </div>

          <div className="arm-card-services" aria-label="Службы реагирования">
            <span>Службы:</span>
            {responseServices.map((service) => (
              <button
                disabled={isSubmitted || !isCallAccepted}
                aria-pressed={fields.services.includes(service)}
                className={
                  fields.services.includes(service)
                    ? "arm-card-services__selected"
                    : undefined
                }
                key={service}
                onClick={() => toggleService(service)}
                type="button"
              >
                {service}
              </button>
            ))}
            <small>
              {fields.services.length > 0
                ? `Выбрано служб: ${fields.services.length}`
                : "Выберите службы реагирования."}
            </small>
          </div>

          {error && (
            <p className="incident-card-form__error" role="alert">
              {error}
            </p>
          )}
          {isSubmitted && (
            <p className="incident-card-form__success">
              Карточка передана на учебную проверку.
            </p>
          )}
          {!isSubmitted && !isCallAccepted && (
            <p className="incident-card-form__error" role="status">
              Примите учебный вызов, чтобы начать работу с карточкой.
            </p>
          )}
        </div>
      </DialogContent>
      <DialogActions>
        <Button startIcon={<CloseIcon />} onClick={onClose}>
          Закрыть
        </Button>
        <Button
          onClick={commitAction}
          disabled={isSubmitted || !isCallAccepted}
        >
          Зафиксировать действие
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={isSubmitted || !isCallAccepted}
        >
          Отправить на проверку
        </Button>
      </DialogActions>
    </>
  );
};
