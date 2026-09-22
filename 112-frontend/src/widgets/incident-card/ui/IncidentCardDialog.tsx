import { IncidentCardContext } from "../model/IncidentCardContext";
import {
  formatAddress,
  incidentStatuses,
  incidentStatusLabels,
} from "@/entities/incident-card";
import { useIncidentEditor } from "@/features/incident-editing";
import { LocationPicker } from "@/features/location-picker";
import { ArmIconButton, ArmSelect, ArmTextarea } from "@/shared/ui/arm";
import { FieldFeedbackContext } from "@/shared/ui/arm/FieldFeedback";
import { Dialog, DialogContent, DialogTitle } from "@mui/material";
import { useId, useState } from "react";
import "../styles/incident-card.scss";
import type {
  IncidentCardDialogProps,
  IncidentCardFormProps,
} from "../types/IncidentCardDialog";
import { CardAddressPanel } from "./CardAddressPanel";
import { CardClassification } from "./CardClassification";
import { CardServicesDialog } from "./CardServicesDialog";
import { CardServiceTile } from "./CardServiceTile";
import { CardTelephoneBar } from "./CardTelephoneBar";
export function IncidentCardDialog({
  card,
  ...props
}: IncidentCardDialogProps) {
  const titleId = useId();
  return (
    <Dialog
      open={Boolean(card)}
      onClose={(_, reason) => {
        if (props.readOnly && reason === "escapeKeyDown") props.onClose();
      }}
      fullScreen
      data-learning-highlight={props.remote.highlightTarget ?? undefined}
      className={`arm-card-dialog ${props.readOnlyLayout === "form" ? "arm-card-dialog--readonly-form" : ""}`}
      aria-labelledby={titleId}
    >
      <FieldFeedbackContext.Provider value={props.fieldFeedback ?? {}}>
        {card && (
          <IncidentCardForm
            key={card.id}
            card={card}
            titleId={titleId}
            {...props}
          />
        )}
      </FieldFeedbackContext.Provider>
    </Dialog>
  );
}
function IncidentCardForm(props: IncidentCardFormProps) {
  const {
    card,
    onClose,
    log,
    isSubmitted,
    isCallAccepted,
    elapsedSeconds,
    normSeconds,
    renderMap,
    titleId,
  } = props;
  const editor = useIncidentEditor(props);
  const [preview, setPreview] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [activeService, setActiveService] = useState<string>();
  const [modal, setModal] = useState<"map" | "calls" | "sms" | "timing">();
  const viewing = preview || isSubmitted || !!props.readOnly;
  const summaryLayout = viewing && props.readOnlyLayout !== "form";
  const disabled = viewing || !isCallAccepted || editor.pending;
  const locked = (skill: string) =>
    disabled ||
    (!!props.remote.editableSkills &&
      !props.remote.editableSkills.includes(skill));
  const close = () => {
    if (editor.pending) return;
    if (
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
    <IncidentCardContext value={{ editor, disabled }}>
      <DialogTitle id={titleId} className="visually-hidden">
        Карточка происшествия № {card.id}
      </DialogTitle>
      <CardTelephoneBar
        card={card}
        elapsedSeconds={elapsedSeconds}
        normSeconds={normSeconds}
        viewing={viewing}
        submitted={isSubmitted || !!props.readOnly}
        onViewChange={() => setPreview(!preview)}
        onHistory={setModal}
      />
      {props.remote.message && (
        <div className="arm-source-message">
          <b>Сообщение заявителя:</b> {props.remote.message}
        </div>
      )}
      {props.trainingNotice}
      <div className="arm-card-body" key={viewing ? "view" : "edit"}>
        <CardAddressPanel
          viewing={summaryLayout}
          onMap={() => setModal("map")}
        />
        <CardClassification viewing={summaryLayout} />
      </div>
      {editor.saved && (
        <p className="arm-card-notice" role="status">
          Черновик сохранён на сервере.
        </p>
      )}
      {props.remote.error && (
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
          <div
            className="arm-service-tiles"
            data-learning-target="notification"
          >
            <strong>Службы:</strong>
            {editor.remote.notificationRequired === false && (
              <span>Оповещение не требуется</span>
            )}
            {fields.services.map((service) => {
              const info = editor.remote.services.find((s) => s.id === service);
              return (
                <CardServiceTile
                  key={service}
                  name={info?.name ?? `Служба ${service}`}
                  shortName={info?.short_name}
                  status={isSubmitted ? "Учебная проверка" : "К оповещению"}
                  expanded={activeService === service}
                  onClick={() =>
                    setActiveService(
                      activeService === service ? undefined : service,
                    )
                  }
                />
              );
            })}
            {!viewing && props.remote.loadServices && (
              <ArmIconButton
                icon="plus"
                label="Добавить службы"
                disabled={locked("notification")}
                aria-expanded={servicesOpen}
                onClick={() => setServicesOpen(!servicesOpen)}
              />
            )}
          </div>
          <div className="arm-footer-tools">
            {!viewing && (
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
                data-learning-target="submit"
                aria-label={
                  editor.remote.notificationRequired === false
                    ? "Сохранить без оповещения"
                    : "Оповестить и сохранить карточку"
                }
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
                {editor.remote.services.find((s) => s.id === activeService)
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
                disabled
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
                disabled={locked("description")}
                rows={3}
                value={fields.operatorAction}
                onChange={(e) =>
                  editor.setField("operatorAction", e.target.value)
                }
              />
              <button
                className="arm-small-button"
                disabled={disabled}
                onClick={editor.saveDraft}
              >
                Сохранить комментарий
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
        open={servicesOpen && !viewing && !locked("notification")}
        onClose={() => setServicesOpen(false)}
      />
      <Dialog
        open={Boolean(modal)}
        onClose={() => setModal(undefined)}
        fullWidth
        maxWidth={modal === "map" ? "md" : "sm"}
        aria-labelledby={`${titleId}-aux`}
        className="arm-aux-dialog"
      >
        <DialogTitle id={`${titleId}-aux`}>
          {modal === "map"
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
          {modal === "map" &&
            (renderMap?.(formatAddress(fields.address)) ?? (
              <LocationPicker
                initial={fields.location ?? null}
                readOnly={locked("address")}
                onConfirm={(point) => {
                  editor.setField("location", point);
                  setModal(undefined);
                }}
                onCancel={() => setModal(undefined)}
              />
            ))}
          {modal === "calls" && (
            <p>
              SIP-звонки и аудиозапись пока не подключены. Условие задания
              передаётся текстом.
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
    </IncidentCardContext>
  );
}
