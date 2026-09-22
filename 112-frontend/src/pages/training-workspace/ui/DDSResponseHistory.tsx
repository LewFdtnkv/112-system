import { crewStatusLabels, ddsStatusLabels } from "@/entities/training";
import { ArmIconButton } from "@/shared/ui/arm";
import type { DDSControlsProps } from "../types/DDSControls";
import { DDSHistoryRow } from "./DDSHistoryRow";

export function DDSResponseHistory({ workspace: w }: DDSControlsProps) {
  const { dds, activeService, activeCrew, completed, busy } = w;
  const service = dds.responses.find((r) => r.service_id === activeService)!;
  const own = activeService === dds.profile.service_id;
  const crew = own
    ? dds.crews?.find((c) => c.crew_code === activeCrew)
    : undefined;
  const history = crew ? crew.history : own ? dds.history : [];
  const labels = crew ? crewStatusLabels : ddsStatusLabels;
  const editable =
    own && !crew && !completed && dds.allowed_statuses.length > 0;
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
              label="Редактировать статус службы"
              disabled={busy}
              onClick={() => w.openEditor()}
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
      <div className="dds-history">
        {!crew && service.added_at && (
          <DDSHistoryRow at={service.added_at} status="Добавлена" />
        )}
        {!crew && service.received_at && (
          <DDSHistoryRow at={service.received_at} status="Получена службой" />
        )}
        {history.map((e) => (
          <DDSHistoryRow
            key={e.id}
            at={e.at}
            status={labels[e.status]}
            comment={e.comment}
            crewNumber={e.crew_number}
          />
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
