import "./incident-card.scss";
import { Dialog, DialogContent, DialogTitle } from "@mui/material";
import { useState, type ReactNode } from "react";
import {
  formatAddress,
  incidentStatuses,
  incidentStatusLabels,
  type IncidentCard,
} from "@/entities/incident-card";
import {
  useIncidentEditor,
  type IncidentEditorOptions,
} from "@/features/incident-editing";
import {
  ArmField,
  ArmIconButton,
  ArmSelect,
  ArmTextarea,
} from "@/shared/ui/arm";
import { CardAddressPanel } from "./CardAddressPanel";
import { CardClassification } from "./CardClassification";
import { CardServicesDialog } from "./CardServicesDialog";
import { CardTelephoneBar } from "./CardTelephoneBar";

interface IncidentCardDialogProps extends Omit<IncidentEditorOptions, "card"> {
  card: IncidentCard | null;
  elapsedSeconds: number;
  normSeconds: number;
  onClose: () => void;
  renderMap?: (address: string) => ReactNode;
  readOnly?: boolean;
  responseFooter?: ReactNode;
  trainingNotice?: ReactNode;
}
export function IncidentCardDialog({
  card,
  ...props
}: IncidentCardDialogProps) {
  return (
    <Dialog
      open={Boolean(card)}
      onClose={(_, reason) => {
        if (!props.remote && reason === "escapeKeyDown") props.onClose();
      }}
      fullScreen
      className="arm-card-dialog"
      aria-labelledby="incident-card-title"
    >
      {card && <IncidentCardForm key={card.id} card={card} {...props} />}
    </Dialog>
  );
}
function IncidentCardForm(
  props: Omit<IncidentCardDialogProps, "card"> & { card: IncidentCard },
) {
  const {
    card,
    onClose,
    log,
    isSubmitted,
    isCallAccepted,
    elapsedSeconds,
    normSeconds,
    renderMap,
  } = props;
  const editor = useIncidentEditor(props);
  const [preview, setPreview] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [activeService, setActiveService] = useState<string>();
  const [modal, setModal] = useState<
    "victims" | "map" | "calls" | "sms" | "timing"
  >();
  const viewing = preview || isSubmitted || !!props.readOnly;
  const disabled = viewing || !isCallAccepted || editor.pending;
  const close = () => {
    if (editor.pending) return;
    if (
      props.remote &&
      !isSubmitted &&
      editor.dirty &&
      !window.confirm(
        "Закрыть карточку? Несохранённые изменения будут потеряны. Для сохранения используйте «Сохранить черновик».",
      )
    )
      return;
    onClose();
  };
  const { fields } = editor;
  return (
    <>
      <DialogTitle id="incident-card-title" className="visually-hidden">
        Карточка происшествия № {card.id}
      </DialogTitle>
      <CardTelephoneBar
        card={card}
        editor={editor}
        disabled={disabled}
        accepted={isCallAccepted}
        elapsedSeconds={elapsedSeconds}
        normSeconds={normSeconds}
        viewing={viewing}
        submitted={isSubmitted || !!props.readOnly}
        onViewChange={() => setPreview(!preview)}
        onHistory={setModal}
      />
      {props.remote?.message && (
        <div className="arm-source-message">
          <b>Сообщение заявителя:</b> {props.remote.message}
        </div>
      )}
      {props.trainingNotice}
      <div className="arm-card-body" key={viewing ? "view" : "edit"}>
        <CardAddressPanel
          editor={editor}
          disabled={disabled}
          viewing={viewing}
          onMap={() => setModal("map")}
        />
        <CardClassification
          editor={editor}
          disabled={disabled}
          viewing={viewing}
          onVictims={() => setModal("victims")}
        />
      </div>
      {editor.saved && (
        <p className="arm-card-notice" role="status">
          Черновик сохранён на сервере.
        </p>
      )}
      {props.remote?.error && (
        <p className="arm-card-notice arm-card-notice--error" role="alert">
          {props.remote.error}
        </p>
      )}
      {editor.error && (
        <p className="arm-card-notice arm-card-notice--error" role="alert">
          {editor.error}
        </p>
      )}
      {!isSubmitted && !isCallAccepted && (
        <p className="arm-card-notice" role="status">
          Примите учебный вызов, чтобы начать работу с карточкой.
        </p>
      )}
      {isSubmitted && !props.readOnly && (
        <p className="arm-card-notice" role="status">
          Карточка передана на учебную проверку.
        </p>
      )}
      {props.responseFooter ?? (
        <footer
          className={`arm-card-footer ${viewing ? "arm-card-footer--view" : ""}`}
        >
          <div className="arm-service-tiles">
            <strong>Службы:</strong>
            {fields.services.map((service) => (
              <button
                key={service}
                className="arm-service-tile"
                aria-expanded={activeService === service}
                onClick={() =>
                  setActiveService(
                    activeService === service ? undefined : service,
                  )
                }
              >
                <span>⌃</span>
                <strong>
                  {props.remote?.services.find((s) => s.id === service)?.name ??
                    `Служба ${service}`}
                </strong>
                <small>
                  {isSubmitted ? "Учебная проверка" : "К оповещению"}
                </small>
              </button>
            ))}
            {!viewing && !props.remote && (
              <ArmIconButton
                icon="plus"
                label="Добавить службы"
                disabled={disabled}
                aria-expanded={servicesOpen}
                onClick={() => setServicesOpen(!servicesOpen)}
              />
            )}
          </div>
          <div className="arm-footer-tools">
            {!viewing && props.remote && (
              <button
                className="arm-small-button"
                disabled={disabled}
                onClick={editor.saveDraft}
              >
                Сохранить черновик
              </button>
            )}
            {!viewing && (
              <button
                className="arm-save"
                aria-label="Оповестить и сохранить карточку"
                disabled={disabled}
                onClick={editor.submit}
              >
                сохранить
              </button>
            )}
            {!viewing && (
              <>
                <ArmIconButton
                  icon="link"
                  label="Связанные происшествия — недоступно в этом задании"
                  disabled
                />
                <ArmIconButton
                  icon="timer"
                  label="Время заполнения карточки"
                  onClick={() => setModal("timing")}
                />
                <ArmIconButton
                  icon="hand"
                  label="Постобработка вызова — недоступно в этом задании"
                  disabled
                />
                <ArmIconButton
                  icon="bell"
                  label="Напоминание — недоступно в этом задании"
                  disabled
                />
              </>
            )}
            <ArmIconButton
              icon="comment"
              label="Учебный комментарий и журнал"
              aria-expanded={commentOpen}
              onClick={() => setCommentOpen(!commentOpen)}
            />
            <ArmIconButton icon="close" label="Закрыть" onClick={close} />
          </div>
          {activeService && (
            <section
              className="arm-service-history"
              aria-label={`История службы ${activeService}`}
            >
              <h3>
                {props.remote?.services.find((s) => s.id === activeService)
                  ?.name ?? `Служба ${activeService}`}
                <ArmIconButton
                  icon="close"
                  label="Закрыть историю службы"
                  onClick={() => setActiveService(undefined)}
                />
              </h3>
              <p>
                Статус:{" "}
                {isSubmitted
                  ? "Передана на учебную проверку"
                  : "Выбрана для оповещения"}
              </p>
              <p>
                {isSubmitted
                  ? "Учебная карточка сохранена."
                  : "Служба будет включена в учебное оповещение при сохранении карточки."}
              </p>
            </section>
          )}
          {commentOpen && (
            <section
              className="arm-training-comment"
              aria-label="Учебный комментарий"
            >
              <h3>
                Учебный комментарий
                <ArmIconButton
                  icon="close"
                  label="Закрыть учебный комментарий"
                  onClick={() => setCommentOpen(false)}
                />
              </h3>
              <ArmSelect
                label="Статус обработки"
                disabled={disabled || !!props.remote}
                value={fields.status}
                onChange={(e) =>
                  editor.setField(
                    "status",
                    e.target.value as typeof fields.status,
                  )
                }
              >
                {incidentStatuses.map((status) => (
                  <option value={status} key={status}>
                    {incidentStatusLabels[status]}
                  </option>
                ))}
              </ArmSelect>
              <ArmTextarea
                label="Действие оператора"
                disabled={disabled}
                rows={3}
                value={fields.operatorAction}
                onChange={(e) =>
                  editor.setField("operatorAction", e.target.value)
                }
              />
              <button
                className="arm-small-button"
                disabled={disabled}
                onClick={props.remote ? editor.saveDraft : editor.commitAction}
              >
                {props.remote
                  ? "Сохранить комментарий"
                  : "Зафиксировать действие"}
              </button>
              {!viewing && (
                <button
                  className="arm-small-button"
                  onClick={() => {
                    setPreview(true);
                    setCommentOpen(false);
                  }}
                >
                  Просмотр карточки
                </button>
              )}
              <h4>Журнал действий</h4>
              {log.length ? (
                <ul>
                  {log.map((entry, i) => (
                    <li key={i}>{entry}</li>
                  ))}
                </ul>
              ) : (
                <p>Действий пока нет.</p>
              )}
            </section>
          )}
        </footer>
      )}
      <CardServicesDialog
        open={servicesOpen && !viewing}
        selected={fields.services}
        onToggle={editor.toggleService}
        onClose={() => setServicesOpen(false)}
      />
      <Dialog
        open={Boolean(modal)}
        onClose={() => setModal(undefined)}
        fullWidth
        maxWidth={modal === "map" ? "md" : "sm"}
        className="arm-aux-dialog"
      >
        <DialogTitle>
          {modal === "victims"
            ? "Пострадавшие"
            : modal === "map"
              ? "Карта происшествия"
              : modal === "calls"
                ? "Записи звонков"
                : modal === "timing"
                  ? "Время заполнения карточки"
                  : "Список SMS"}
          <ArmIconButton
            icon="close"
            label="Закрыть окно"
            onClick={() => setModal(undefined)}
          />
        </DialogTitle>
        <DialogContent>
          {modal === "victims" && (
            <ArmField
              label="Пострадавших"
              type="number"
              min={0}
              step={1}
              disabled={disabled}
              value={fields.victimsCount ?? ""}
              onChange={(e) =>
                editor.setField(
                  "victimsCount",
                  e.target.value === ""
                    ? null
                    : Math.max(0, Number(e.target.value)),
                )
              }
            />
          )}
          {modal === "map" &&
            (renderMap?.(formatAddress(fields.address)) ?? (
              <p>Карта не подключена.</p>
            ))}
          {modal === "calls" && (
            <p>
              {props.remote
                ? "SIP-звонки и аудиозапись пока не подключены. Условие задания передаётся текстом."
                : isCallAccepted
                  ? `Учебный вызов · ${card.channel}. Аудиозапись в этом задании не предусмотрена.`
                  : "Учебный вызов ещё не принят."}
            </p>
          )}
          {modal === "timing" && (
            <p>
              Прошло: {elapsedSeconds} с. Учебный ориентир: {normSeconds} с.
            </p>
          )}
          {modal === "sms" && <p>В этом учебном задании SMS отсутствуют.</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
