import { randomUUID } from "@/shared/lib/uuid";
import "./dds-workspace.scss";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import {
  trainingApi,
  ddsStatusLabels,
  type Attempt,
} from "@/entities/training";
import { attemptCard } from "@/features/incident-editing";
import { IncidentCardDialog } from "@/widgets/incident-card";
import {
  ArmField,
  ArmIconButton,
  ArmSelect,
  ArmTextarea,
} from "@/shared/ui/arm";
import { getApiError } from "@/shared/api";

export function DDSWorkspace({
  initial,
  onClose,
  onSaved,
}: {
  initial: Attempt;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [attempt, setAttempt] = useState(initial);
  const [status, setStatus] = useState("");
  const [crew, setCrew] = useState(initial.dds?.crew_number ?? "");
  const [comment, setComment] = useState("");
  const [requestId, setRequestId] = useState(() => randomUUID());
  const [editing, setEditing] = useState(false);
  const [activeService, setActiveService] = useState(
    initial.dds!.profile.service_id,
  );
  const [now, setNow] = useState(Date.now);
  const dds = attempt.dds!;
  const completed = attempt.status !== "in_progress";
  useEffect(() => {
    if (completed || dds.first_decision_at) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [completed, dds.first_decision_at]);
  const update = (data: Attempt) => {
    setAttempt(data);
    setStatus("");
    setComment("");
    setEditing(false);
    setRequestId(randomUUID());
    onSaved();
  };
  const save = useMutation({
    mutationFn: () =>
      trainingApi.ddsAction(attempt.id, {
        request_id: requestId,
        revision: dds.revision,
        information_event_id: dds.information!.id,
        status,
        crew_number: crew || null,
        comment,
      }),
    onSuccess: update,
  });
  const finish = useMutation({
    mutationFn: () => trainingApi.ddsSubmit(attempt.id, dds.revision),
    onSuccess: update,
  });
  const reload = useMutation({
    mutationFn: () => trainingApi.attempt(attempt.id),
    onSuccess: update,
  });
  const error = save.error || finish.error || reload.error;
  const elapsed = Math.max(
    0,
    Math.floor(
      ((dds.first_decision_at ? Date.parse(dds.first_decision_at) : now) -
        Date.parse(dds.sent_at)) /
        1000,
    ),
  );
  const close = () => {
    if (
      !comment ||
      window.confirm(
        "Закрыть карточку? Несохранённый комментарий будет потерян.",
      )
    )
      onClose();
  };
  const service = dds.responses.find((r) => r.service_id === activeService);
  const ownService = activeService === dds.profile.service_id;
  const busy = save.isPending || finish.isPending || reload.isPending;
  return (
    <>
      <IncidentCardDialog
        card={attemptCard(attempt)}
        log={[]}
        readOnly
        isSubmitted={completed}
        isCallAccepted
        onClose={close}
        onCommitAction={() => {}}
        onSubmit={() => {}}
        elapsedSeconds={elapsed}
        normSeconds={attempt.norm_seconds}
        remote={{
          categories: [],
          categoryName:
            attempt.classifier_entry?.display_name ||
            attempt.classifier_entry?.name ||
            "",
          features:
            (attempt.classifier_entry?.conditions.features as
              { key: string; label: string }[] | undefined) ?? [],
          services: dds.responses.map((r) => ({
            id: r.service_id,
            name: r.name,
          })),
          search: () => {},
          select: () => {},
          onSave: async () => {},
          searching: false,
        }}
        trainingNotice={
          <section className="dds-training-notice">
            <details>
              <summary>
                Учебное задание ДДС · {dds.profile.name} · цель: {dds.goal} ·
                первичное решение: {elapsed} с от направления
              </summary>
              <p>{attempt.instructions}</p>
              <p>{dds.profile.responsibility}</p>
              <p>{dds.profile.procedure}</p>
              {dds.profile.territories.map((t) => (
                <p key={t.code}>
                  {t.name}: {t.description}
                </p>
              ))}
              {dds.profile.objects.map((o) => (
                <p key={o.code}>
                  {o.name}, {o.address}: {o.responsibility}
                </p>
              ))}
              {dds.profile.contacts.map((c) => (
                <p key={c.code}>
                  {c.name} {c.position}: {c.description}
                </p>
              ))}
              <p>Звонки пока не подключены.</p>
            </details>
            {!completed && dds.information && (
              <p>
                <b>Сообщение по сценарию:</b> {dds.information.message}
              </p>
            )}
            {completed && (
              <p role="status">
                Упражнение завершено. Автоматическая оценка сохранена.
              </p>
            )}
            {error && (
              <p role="alert">
                {getApiError(error).message}{" "}
                <button
                  className="arm-small-button"
                  onClick={() => reload.mutate()}
                  disabled={busy}
                >
                  Обновить карточку
                </button>
              </p>
            )}
          </section>
        }
        responseFooter={
          <footer className="arm-card-footer arm-card-footer--view dds-footer">
            <div className="arm-service-tiles">
              <strong>Службы:</strong>
              {dds.responses.map((r) => (
                <button
                  key={r.service_id}
                  className={`arm-service-tile ${activeService === r.service_id ? "dds-service-active" : ""}`}
                  aria-expanded={activeService === r.service_id}
                  onClick={() =>
                    setActiveService(
                      activeService === r.service_id ? "" : r.service_id,
                    )
                  }
                >
                  <span>⌃</span>
                  <strong>{r.name}</strong>
                  <small>{ddsStatusLabels[r.status]}</small>
                </button>
              ))}
            </div>
            <div className="arm-footer-tools">
              {!completed && !dds.can_finish && (
                <button
                  className="arm-small-button"
                  onClick={() => setEditing(true)}
                  disabled={busy}
                >
                  Изменить статус ДДС
                </button>
              )}
              {!completed && dds.can_finish && (
                <button
                  className="arm-save"
                  onClick={() => finish.mutate()}
                  disabled={busy}
                >
                  Завершить упражнение
                </button>
              )}
              <ArmIconButton
                icon="close"
                label="Закрыть карточку ДДС"
                onClick={close}
                disabled={busy}
              />
            </div>
            {service && (
              <section
                className="arm-service-history dds-history"
                aria-label="История статусов ДДС"
              >
                <h3>
                  {service.name}
                  <ArmIconButton
                    icon="close"
                    label="Закрыть историю службы"
                    onClick={() => setActiveService("")}
                  />
                </h3>
                <p>
                  Получена службой ·{" "}
                  {new Date(dds.sent_at).toLocaleTimeString("ru-RU", {
                    timeZone: "Europe/Moscow",
                  })}{" "}
                  МСК
                </p>
                {ownService ? (
                  dds.history.map((e) => (
                    <div key={e.id} className="dds-history-row">
                      <time>
                        {new Date(e.at).toLocaleTimeString("ru-RU", {
                          timeZone: "Europe/Moscow",
                        })}
                      </time>
                      <b>{ddsStatusLabels[e.status]}</b>
                      <span>
                        {e.crew_number} {e.comment}
                      </span>
                    </div>
                  ))
                ) : (
                  <p>
                    {ddsStatusLabels[service.status]} · {service.comment || ""}
                  </p>
                )}
                {ownService && !completed && !dds.can_finish && (
                  <ArmIconButton
                    icon="edit"
                    label="Редактировать статус службы"
                    onClick={() => setEditing(true)}
                  />
                )}
              </section>
            )}
          </footer>
        }
      />
      <Dialog
        open={editing}
        onClose={() => {
          if (!busy) setEditing(false);
        }}
        fullWidth
        maxWidth="sm"
        className="arm-aux-dialog dds-status-dialog"
      >
        <DialogTitle>
          Изменение статуса · {dds.profile.name}
          <ArmIconButton
            icon="close"
            label="Закрыть изменение статуса"
            onClick={() => setEditing(false)}
            disabled={busy}
          />
        </DialogTitle>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <p>{dds.information?.message}</p>
            <ArmSelect
              label="Статус реагирования"
              value={status}
              required
              disabled={busy}
              onChange={(e) => {
                setStatus(e.target.value);
                setRequestId(randomUUID());
              }}
            >
              <option value="">Выберите статус</option>
              {dds.allowed_statuses.map((s) => (
                <option key={s} value={s}>
                  {ddsStatusLabels[s]}
                </option>
              ))}
            </ArmSelect>
            <ArmField
              label="Номер наряда"
              value={crew}
              maxLength={100}
              disabled={busy}
              onChange={(e) => {
                setCrew(e.target.value);
                setRequestId(randomUUID());
              }}
            />
            <ArmTextarea
              label="Комментарий ДДС"
              value={comment}
              required
              rows={4}
              maxLength={10000}
              disabled={busy}
              onChange={(e) => {
                setComment(e.target.value);
                setRequestId(randomUUID());
              }}
            />
            {save.error && (
              <p role="alert">{getApiError(save.error).message}</p>
            )}
            <button
              className="arm-small-button"
              type="submit"
              disabled={!status || busy}
            >
              Сохранить статус
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
