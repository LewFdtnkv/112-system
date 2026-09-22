import { crewStatusLabels, ddsStatusLabels } from "@/entities/training";
import { ArmIconButton } from "@/shared/ui/arm";
import { ddsTime } from "../lib/ddsTime";
import type { DDSControlsProps } from "../types/DDSControls";

export function DDSResponseHistory({ workspace: w }: DDSControlsProps) {
  const { dds, activeService, activeCrew, completed, busy } = w;
  const service = dds.responses.find((r) => r.service_id === activeService)!;
  const own = activeService === dds.profile.service_id;
  const crew = own
    ? dds.crews?.find((c) => c.crew_code === activeCrew)
    : undefined;
  const history = crew ? crew.history : own ? dds.history : [];
  const labels = crew ? crewStatusLabels : ddsStatusLabels;
  const canManage = [
    "accepted",
    "responding",
    "arrived",
    "in_progress",
  ].includes(dds.status);
  const editable =
    own &&
    !completed &&
    (crew
      ? canManage && crew.allowed_statuses.length > 0
      : dds.allowed_statuses.length > 0);
  const contact = dds.profile.contacts.find(
    (c) => c.code === crew?.contact_code,
  );
  return (
    <section
      className="dds-response-panel"
      aria-label={crew ? "История бригады" : "История статусов ДДС"}
    >
      <header>
        <strong>{crew?.name ?? service.name}</strong>
        <div className="dds-history-tools">
          {editable && (
            <ArmIconButton
              icon="edit"
              label={
                crew ? "Изменить статус бригады" : "Редактировать статус службы"
              }
              disabled={busy}
              onClick={() => w.openEditor(crew?.crew_code)}
            />
          )}
          <ArmIconButton
            icon="close"
            label={crew ? "Закрыть историю бригады" : "Закрыть историю службы"}
            onClick={() => {
              w.setActiveCrew("");
              w.setServiceHistory(false);
            }}
          />
        </div>
      </header>
      {crew && contact && (
        <p>
          Старший: {contact.name} {contact.position}
        </p>
      )}
      <div className="dds-history">
        {!crew && service.added_at && (
          <div className="dds-history-row">
            <time dateTime={service.added_at}>
              {ddsTime(service.added_at, true)}
            </time>
            <b>Добавлена</b>
          </div>
        )}
        {!crew && service.received_at && (
          <div className="dds-history-row">
            <time dateTime={service.received_at}>
              {ddsTime(service.received_at, true)}
            </time>
            <b>Получена службой</b>
          </div>
        )}
        {history.map((e) => (
          <div className="dds-history-row" key={e.id}>
            <time dateTime={e.at}>{ddsTime(e.at, true)}</time>
            <b>{labels[e.status]}</b>
            <span>
              {e.crew_number && `Наряд ${e.crew_number} · `}
              {e.comment}
            </span>
          </div>
        ))}
        {!own && (
          <p>
            {ddsStatusLabels[service.status]} ·{" "}
            {service.comment ||
              "Эта служба не назначена в задании; доступен только просмотр."}
          </p>
        )}
      </div>
    </section>
  );
}
