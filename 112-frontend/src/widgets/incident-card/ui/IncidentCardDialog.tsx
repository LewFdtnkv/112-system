import { FieldErrors } from "@/shared/ui/form-validation";
import { IncidentCardProvider } from "../model/IncidentCardContext";
import { useIncidentEditor } from "@/features/incident-editing";
import { FieldFeedbackContext } from "@/shared/ui/arm/FieldFeedback";
import { Dialog, DialogTitle } from "@mui/material";
import { useId, useState } from "react";
import "../styles/incident-card.scss";
import type {
  IncidentCardDialogProps,
  IncidentCardFormProps,
} from "../types/IncidentCardDialog";
import { CardAddressPanel } from "./CardAddressPanel";
import { CardClassification } from "./CardClassification";
import { CardServicesDialog } from "./CardServicesDialog";
import { CardServiceHistory } from "./CardServiceHistory";
import { CardServiceTiles } from "./CardServiceTiles";
import { CardTrainingComment } from "./CardTrainingComment";
import { CardFooterTools } from "./CardFooterTools";
import { CardTelephoneBar } from "./CardTelephoneBar";
import { IncidentCardAuxiliaryDialog } from "./IncidentCardAuxiliaryDialog";
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
    titleId,
  } = props;
  const editor = useIncidentEditor(props);
  const [preview, setPreview] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [activeService, setActiveService] = useState<string>();
  const [modal, setModal] = useState<
    "map" | "calls" | "sms" | "timing" | "translate"
  >();
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
  return (
    <IncidentCardProvider value={{ editor, disabled }}>
      <FieldErrors
        issues={editor.fieldIssues}
        focusKey={editor.validationAttempt}
      >
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
        <div className="arm-card-body" key={viewing ? "view" : "edit"}>
          {props.remote.message && (
            <div className="arm-source-message" data-learning-target="source">
              <b>Сообщение заявителя:</b> {props.remote.message}
            </div>
          )}
          {props.trainingNotice}
          <div className="arm-card-fields">
            <CardAddressPanel
              viewing={summaryLayout}
              onMap={() => setModal("map")}
              onTranslate={() => setModal("translate")}
            />
            <CardClassification viewing={summaryLayout} />
          </div>
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
            <CardServiceTiles
              editor={editor}
              submitted={isSubmitted}
              viewing={viewing}
              activeService={activeService}
              onActiveServiceChange={setActiveService}
              servicesOpen={servicesOpen}
              onServicesToggle={() => setServicesOpen(!servicesOpen)}
              locked={locked}
            />
            <CardFooterTools
              editor={editor}
              viewing={viewing}
              disabled={disabled}
              commentOpen={commentOpen}
              onCommentToggle={() => setCommentOpen(!commentOpen)}
              onClose={close}
              onTiming={() => setModal("timing")}
            />
            {activeService && (
              <CardServiceHistory
                serviceId={activeService}
                serviceName={
                  editor.remote.services.find(
                    (service) => service.id === activeService,
                  )?.name
                }
                submitted={isSubmitted}
                onClose={() => setActiveService(undefined)}
              />
            )}
            {commentOpen && (
              <CardTrainingComment
                editor={editor}
                disabled={disabled}
                viewing={viewing}
                locked={locked}
                log={log}
                onClose={() => setCommentOpen(false)}
                onPreview={() => {
                  setPreview(true);
                  setCommentOpen(false);
                }}
              />
            )}
          </footer>
        )}
        <CardServicesDialog
          open={servicesOpen && !viewing && !locked("notification")}
          onClose={() => setServicesOpen(false)}
        />
        <IncidentCardAuxiliaryDialog
          props={props}
          editor={editor}
          locked={locked}
          modal={modal}
          setModal={setModal}
        />
      </FieldErrors>
    </IncidentCardProvider>
  );
}
