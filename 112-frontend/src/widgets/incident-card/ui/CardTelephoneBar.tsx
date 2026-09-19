import type { IncidentCard } from "@/entities/incident-card";
import type { IncidentEditor } from "@/features/incident-editing";
import { ArmField, ArmIcon, ArmIconButton } from "@/shared/ui/arm";
import { formatDuration } from "@/shared/lib/formatDuration";

interface Props {
  card: IncidentCard;
  editor: IncidentEditor;
  disabled: boolean;
  accepted: boolean;
  elapsedSeconds: number;
  normSeconds: number;
  viewing: boolean;
  submitted: boolean;
  onViewChange: () => void;
  onHistory: (kind: "calls" | "sms") => void;
}
export function CardTelephoneBar({
  card,
  editor,
  disabled,
  accepted,
  elapsedSeconds,
  normSeconds,
  viewing,
  submitted,
  onViewChange,
  onHistory,
}: Props) {
  return (
    <header className="arm-telephone-bar">
      <div className="arm-call-status">
        <ArmIcon name="callEnd" />
        <div>
          <span>
            {editor.remote
              ? "Учебное сообщение"
              : accepted
                ? "Отключение"
                : "Ожидание вызова"}
          </span>
          <div>
            <button onClick={() => onHistory("calls")}>записи звонков</button>
            <button onClick={() => onHistory("sms")}>список SMS</button>
          </div>
        </div>
      </div>
      {(
        [
          ["callerId", "АОН"],
          ["provided", "Предоставленный"],
          ["onSite", "Телефон на месте"],
        ] as const
      ).map(([key, label]) => (
        <div className="arm-phone" key={key}>
          <div className="arm-phone__tools">
            <ArmIconButton
              icon="phone"
              label={`Учебные звонки: ${label}`}
              onClick={() => onHistory("calls")}
            />
            <ArmIconButton
              icon="sms"
              label={`История SMS: ${label}`}
              onClick={() => onHistory("sms")}
            />
          </div>
          <div className="arm-phone__field">
            <ArmField
              label={label}
              type="tel"
              value={editor.fields.phones[key]}
              placeholder="+7 (   )   -  -"
              disabled={disabled}
              onChange={(event) =>
                editor.setPhoneField(key, event.target.value)
              }
            />
            <span className="arm-phone__globe">
              <ArmIcon name="globe" />
            </span>
            {key !== "callerId" && !viewing && (
              <button
                className="arm-copy-phone"
                disabled={disabled}
                onClick={() =>
                  editor.setPhoneField(key, editor.fields.phones.callerId)
                }
              >
                АОН
              </button>
            )}
          </div>
        </div>
      ))}
      <div className="arm-card-identification">
        <strong>Происшествие {card.displayNumber ?? card.id}</strong>
        <span>
          Созд. {card.createdDate ?? "—"} в {card.createdAt}
        </span>
        <span>
          Опер. {card.operatorNumber ?? "—"}, АРМ {card.workstation ?? "—"}, УМЦ
        </span>
      </div>
      {viewing ? (
        <div className="arm-view-switch">
          <button
            className="is-selected"
            aria-pressed="true"
            disabled={submitted}
          >
            просмотр
          </button>
          <button disabled={submitted} onClick={onViewChange}>
            дополнение
          </button>
        </div>
      ) : (
        <div
          className={`arm-card-clock ${elapsedSeconds >= normSeconds ? "is-overdue" : ""}`}
          title={`Учебный ориентир: ${formatDuration(normSeconds)}`}
        >
          <strong aria-label="Время заполнения карточки относительно учебного ориентира">
            {formatDuration(elapsedSeconds)}
            <span className="visually-hidden">
              {" "}
              / {formatDuration(normSeconds)}
            </span>
          </strong>
          <span>минут / секунд</span>
          {elapsedSeconds >= normSeconds && (
            <span className="visually-hidden">Учебный ориентир превышен</span>
          )}
        </div>
      )}
    </header>
  );
}
