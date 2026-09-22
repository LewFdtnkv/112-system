import { useIncidentCardContext } from "../model/IncidentCardContext";
import { emptyIncidentAddress, formatAddress } from "@/entities/incident-card";
import {
  ArmField,
  ArmIconButton,
  ArmSelect,
  ArmTextarea,
} from "@/shared/ui/arm";
import type { Props } from "../types/CardAddressPanel";
export function CardAddressPanel({ viewing, onMap }: Props) {
  const { editor, disabled } = useIncidentCardContext();
  const { fields, setField, setDetail, setAddressField } = editor;
  const address = fields.address;
  const country = address.country ?? (disabled ? "" : "Россия");
  const region = address.region ?? (disabled ? "" : "Москва");
  const addressLine = [
    region.trim().toLocaleLowerCase() ===
    (address.locality ?? "").trim().toLocaleLowerCase()
      ? ""
      : region,
    formatAddress(address),
  ]
    .filter(Boolean)
    .join(", ");
  if (viewing)
    return (
      <section
        className="arm-card-left arm-card-left--view"
        aria-label="Сведения о происшествии"
      >
        <div className="arm-applicant">
          <span>{fields.callerName || "ФИО заявителя"}</span>
        </div>
        <div className="arm-address-view">
          <ArmIconButton
            icon="map"
            label="Показать адрес на карте"
            onClick={onMap}
          />
          <strong>{[country, addressLine].filter(Boolean).join(", ")}</strong>
          <p>{[address.district, address.area].filter(Boolean).join(", ")}</p>
          {fields.location && (
            <p title="Координаты происшествия">
              {fields.location.latitude.toFixed(6)},{" "}
              {fields.location.longitude.toFixed(6)}
            </p>
          )}
        </div>
        <div className="arm-description-view">
          <p>{fields.description}</p>
        </div>
      </section>
    );
  return (
    <section
      className="arm-card-left"
      aria-label="Заявитель и адрес происшествия"
    >
      <div className="arm-applicant">
        <ArmField
          label="Заявитель"
          inline
          placeholder="Фамилия и имя заявителя"
          disabled={disabled}
          value={fields.callerName}
          onChange={(e) => setField("callerName", e.target.value)}
        />
        <ArmSelect
          label="Статус заявителя"
          className="arm-applicant__status"
          disabled={disabled}
          value={fields.details?.callerStatus ?? ""}
          onChange={(e) => setDetail("callerStatus", e.target.value)}
        >
          <option value="">Выберите статус</option>
          <option>Заявитель</option>
          <option>Очевидец</option>
          <option>Пострадавший</option>
        </ArmSelect>
        <ArmSelect
          label="Пол заявителя"
          disabled={disabled}
          value={fields.details?.callerGender ?? ""}
          onChange={(e) => setDetail("callerGender", e.target.value)}
        >
          <option value=""></option>
          <option>Мужской</option>
          <option>Женский</option>
        </ArmSelect>
        <ArmField
          label="Возраст заявителя"
          inline
          type="number"
          min={0}
          max={120}
          disabled={disabled}
          value={fields.details?.callerAge ?? ""}
          onChange={(e) => setDetail("callerAge", e.target.value)}
        />
        <ArmIconButton
          icon="translate"
          label="Вызов на иностранном языке"
          disabled={disabled}
          aria-pressed={fields.details?.foreignLanguage ?? false}
          onClick={() =>
            setDetail("foreignLanguage", !fields.details?.foreignLanguage)
          }
        />
      </div>
      <div className="arm-address-block">
        <div className="arm-address-heading">
          <span>Адрес:</span>
          {fields.location && (
            <span title="Координаты происшествия">
              {fields.location.latitude.toFixed(6)},{" "}
              {fields.location.longitude.toFixed(6)}
            </span>
          )}
          <ArmIconButton
            icon="map"
            label="Показать адрес на карте"
            onClick={onMap}
          />
        </div>
        <div className="arm-address-line">
          {addressLine || "—"}
          <ArmIconButton
            icon="close"
            label="Очистить адрес"
            disabled={disabled}
            onClick={() =>
              setField("address", {
                ...emptyIncidentAddress,
                country: "",
                region: "Москва",
              })
            }
          />
        </div>
        <div className="arm-address-grid">
          {(
            [
              ["country", "Страна", "Россия", "country"],
              ["region", "Субъект", "Москва", "region"],
              ["locality", "Населённый пункт", "", "locality"],
              ["object", "Объект", "", "object"],
              ["district", "Округ", "", "district"],
              ["area", "Район", "", "area"],
              ["street", "Улица", "", "street"],
              ["house", "Дом/Вл", "", "house"],
              ["building", "Корпус/Стр", "", "building"],
              ["structure", "Стр/соор", "", "structure"],
              ["apartment", "Квартира/офис", "", "apartment"],
              ["entrance", "Подъезд", "", "entrance"],
              ["floor", "Этаж", "", "floor"],
              ["doorCode", "Код", "", "code"],
            ] as const
          ).map(([key, label, fallback, area]) => (
            <ArmField
              key={key}
              className={`arm-address-grid__${area}`}
              label={label}
              disabled={disabled}
              value={address[key] ?? (disabled ? "" : fallback)}
              onChange={(e) => setAddressField(key, e.target.value)}
            />
          ))}
        </div>
        <ArmTextarea
          label="Описательный адрес"
          disabled={disabled}
          rows={2}
          value={address.description}
          onChange={(e) => setAddressField("description", e.target.value)}
        />
        <button
          className="arm-small-button arm-address-clear"
          disabled={disabled}
          onClick={() =>
            setField("address", {
              ...emptyIncidentAddress,
              country: "",
              region: "Москва",
            })
          }
        >
          очистить адрес
        </button>
      </div>
      <div className="arm-description-block">
        <ArmTextarea
          label="Описание со слов заявителя"
          aria-label="Сообщение со слов заявителя"
          placeholder="введите"
          disabled={disabled}
          value={fields.description}
          maxLength={1999}
          rows={1}
          onChange={(e) => setField("description", e.target.value)}
        />
        <small>{fields.description.length} / 1999</small>
      </div>
    </section>
  );
}
