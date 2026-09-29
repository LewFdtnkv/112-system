import { ValidationField } from "@/shared/ui/form-validation";
import {
  useIncidentCardContext,
  useCardSkillDisabled,
} from "../model/IncidentCardContext";
import { emptyIncidentAddress, formatAddress } from "@/entities/incident-card";
import {
  ArmField,
  ArmIconButton,
  ArmSelect,
  ArmTextarea,
} from "@/shared/ui/arm";
import type { Props } from "../types/CardAddressPanel";
export function CardAddressPanel({ viewing, onMap, onTranslate }: Props) {
  const editor = useIncidentCardContext().editor;
  const disabled = useIncidentCardContext().disabled;
  const callerDisabled = useCardSkillDisabled("caller");
  const addressDisabled = useCardSkillDisabled("address");
  const descriptionDisabled = useCardSkillDisabled("description");
  const { fields, setField, setDetail, setAddressField } = editor;
  const address = fields.address;
  const omitDefaults = disabled || fields.details?.noContact;
  const country = address.country ?? (omitDefaults ? "" : "Россия");
  const region = address.region ?? (omitDefaults ? "" : "Москва");
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
        <div className="arm-applicant" data-learning-target="caller">
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
      <div className="arm-applicant" data-learning-target="caller">
        <ArmField
          data-guide-target="caller_name"
          name="data.caller_name"
          label="Заявитель"
          inline
          placeholder="Фамилия и имя заявителя"
          disabled={callerDisabled}
          value={fields.callerName}
          onChange={(e) => setField("callerName", e.target.value)}
        />
        <ArmSelect
          name="data.additional_fields.details.callerStatus"
          data-guide-target="additional_fields.details.callerStatus"
          label="Статус заявителя"
          className="arm-applicant__status"
          disabled={callerDisabled}
          value={fields.details?.callerStatus ?? ""}
          onChange={(e) => setDetail("callerStatus", e.target.value)}
        >
          <option value="">Выберите статус</option>
          <option>Заявитель</option>
          <option>Очевидец</option>
          <option>Пострадавший</option>
        </ArmSelect>
        <ArmSelect
          name="data.additional_fields.details.callerGender"
          data-guide-target="additional_fields.details.callerGender"
          label="Пол заявителя"
          disabled={callerDisabled}
          value={fields.details?.callerGender ?? ""}
          onChange={(e) => setDetail("callerGender", e.target.value)}
        >
          <option value=""></option>
          <option>Мужской</option>
          <option>Женский</option>
        </ArmSelect>
        <ArmField
          name="data.additional_fields.details.callerAge"
          data-guide-target="additional_fields.details.callerAge"
          label="Возраст заявителя"
          inline
          type="number"
          min={0}
          max={120}
          disabled={callerDisabled}
          value={fields.details?.callerAge ?? ""}
          onChange={(e) => setDetail("callerAge", e.target.value)}
        />
        <ArmIconButton
          icon="translate"
          label="Перевести сообщение заявителя"
          disabled={callerDisabled || descriptionDisabled}
          onClick={onTranslate}
        />
      </div>
      <ValidationField name="data.address_text" label="Адрес происшествия">
        <div className="arm-address-block" data-learning-target="address">
          <div className="arm-address-heading">
            <span>Адрес:</span>
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
              disabled={addressDisabled}
              onClick={() =>
                setField("address", {
                  ...emptyIncidentAddress,
                  country: "",
                  region: fields.details?.noContact ? "" : "Москва",
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
                name={`data.address_details.${key}`}
                data-guide-target={`address_details.${key}`}
                className={`arm-address-grid__${area}`}
                label={label}
                disabled={addressDisabled}
                value={address[key] ?? (omitDefaults ? "" : fallback)}
                onChange={(e) => setAddressField(key, e.target.value)}
              />
            ))}
          </div>
          <ArmTextarea
            data-guide-target="address_details.description"
            name="data.address_details.description"
            label="Описательный адрес"
            disabled={addressDisabled}
            rows={2}
            value={address.description}
            onChange={(e) => setAddressField("description", e.target.value)}
          />
          <button
            className="arm-small-button arm-address-clear"
            disabled={addressDisabled}
            onClick={() =>
              setField("address", {
                ...emptyIncidentAddress,
                country: "",
                region: fields.details?.noContact ? "" : "Москва",
              })
            }
          >
            очистить адрес
          </button>
        </div>
      </ValidationField>
      <div className="arm-description-block" data-learning-target="description">
        <ArmTextarea
          name="data.description"
          label="Описание со слов заявителя"
          aria-label="Сообщение со слов заявителя"
          placeholder="введите"
          disabled={descriptionDisabled}
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
