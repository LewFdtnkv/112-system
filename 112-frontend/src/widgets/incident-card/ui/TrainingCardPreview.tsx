import { attemptCard, referenceCard } from "@/features/incident-editing";
import type { FeatureDefinition } from "@/shared/lib/featureValues";
import { ArmIconButton } from "@/shared/ui/arm";
import { Button } from "@mui/material";
import { useState } from "react";
import type { Props } from "../types/TrainingCardPreview";
import { CardServiceTile } from "./CardServiceTile";
import { IncidentCardDialog } from "./IncidentCardDialog";
export function TrainingCardPreview({
  attempt,
  reference,
  onClose,
  feedback,
  navigation,
  unanswered = false,
}: Props) {
  const [activeService, setActiveService] = useState<string>();
  const card = attempt ? attemptCard(attempt) : referenceCard(reference!);
  const entry = attempt?.classifier_entry ?? reference?.classifier_entry;
  const services = attempt
    ? attempt.status === "completed"
      ? attempt.notified_services
      : attempt.recipient_services
    : (reference?.recipients ?? []);
  const serviceStatus = unanswered
    ? "Нет ответа"
    : !attempt
      ? "Эталонное решение"
      : attempt.status === "completed"
        ? "Оповещена"
        : "Выбрана";
  const selectedService = services.find((s) => s.service_id === activeService);
  return (
    <IncidentCardDialog
      card={card}
      readOnly
      readOnlyLayout="form"
      isSubmitted
      isCallAccepted
      log={[]}
      elapsedSeconds={0}
      normSeconds={0}
      onClose={onClose}
      onCommitAction={() => {}}
      onSubmit={() => {}}
      fieldFeedback={feedback}
      trainingNotice={
        <>
          {navigation}
          <div className="arm-review-heading">
            <div>
              <strong>
                {attempt || unanswered
                  ? "Ответ ученика · карточка АРМ"
                  : "Эталонное решение · карточка АРМ"}
              </strong>
              <span>
                {unanswered
                  ? "Ученик ещё не начал карточку. Ответ отсутствует."
                  : "Просмотр заполненной формы"}
              </span>
            </div>
            {feedback && (
              <span>
                ✓ Совпало · ! Расхождение · ? Требует проверки — подробности при
                наведении на поле
              </span>
            )}
            <Button onClick={onClose}>Вернуться к разбору</Button>
          </div>
        </>
      }
      responseFooter={
        <footer className="arm-card-footer arm-card-footer--view arm-review-services">
          <div className="arm-service-tiles" aria-label="Службы карточки">
            <strong>Службы:</strong>
            {services.map((s) => (
              <CardServiceTile
                key={s.service_id}
                name={s.name}
                shortName={s.short_name}
                status={serviceStatus}
                expanded={activeService === s.service_id}
                onClick={() =>
                  setActiveService(
                    activeService === s.service_id ? undefined : s.service_id,
                  )
                }
              />
            ))}
            {!services.length && (
              <span className="arm-review-services__empty">
                {unanswered ? "Нет ответа" : "Службы отсутствуют"}
              </span>
            )}
          </div>
          <div className="arm-footer-tools">
            <ArmIconButton icon="close" label="Закрыть" onClick={onClose} />
          </div>
          {selectedService && (
            <section
              className="arm-service-history"
              aria-label="Сведения о службе"
            >
              <h3>
                {selectedService.name}
                <ArmIconButton
                  icon="close"
                  label="Закрыть сведения о службе"
                  onClick={() => setActiveService(undefined)}
                />
              </h3>
              <p>{serviceStatus}</p>
            </section>
          )}
        </footer>
      }
      remote={{
        categories: [],
        categoryName: entry?.display_name || entry?.name || "Тип не выбран",
        services: services.map((s) => ({ id: s.service_id, ...s })),
        features: (entry?.conditions.features ?? []) as FeatureDefinition[],
        notificationRequired: entry?.notification_required,
        search: () => {},
        select: () => {},
        onSave: async () => {},
        searching: false,
      }}
    />
  );
}
