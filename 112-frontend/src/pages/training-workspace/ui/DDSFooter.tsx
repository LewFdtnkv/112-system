import { crewStatusLabels, ddsStatusLabels } from "@/entities/training";
import { ArmIconButton } from "@/shared/ui/arm";
import type { DDSControlsProps } from "../types/DDSControls";
import { DDSResponseHistory } from "./DDSResponseHistory";
import { DDSTile } from "./DDSTile";

export function DDSFooter({ workspace: w }: DDSControlsProps) {
  const { dds, completed, busy, activeService, activeCrew } = w;
  const own = activeService === dds.profile.service_id;
  const service = dds.responses.find((r) => r.service_id === activeService);
  const crew = own
    ? dds.crews?.find((c) => c.crew_code === activeCrew)
    : undefined;
  const canManage =
    !completed &&
    ["accepted", "responding", "arrived", "in_progress"].includes(dds.status);
  const available = (dds.profile.crews ?? []).filter(
    (c) => c.is_active && !dds.crews?.some((a) => a.crew_code === c.code),
  );
  const selectService = (id: string) => {
    w.setActiveService(activeService === id ? "" : id);
    w.setActiveCrew("");
    w.setServiceHistory(false);
  };
  const serviceTile = (r: (typeof dds.responses)[number]) => (
    <DDSTile
      key={r.service_id}
      name={r.short_name || r.name}
      title={r.name}
      status={ddsStatusLabels[r.status]}
      updatedAt={r.status_updated_at}
      selected={activeService === r.service_id}
      onClick={() => selectService(r.service_id)}
    />
  );
  return (
    <footer
      className={`arm-card-footer arm-card-footer--view dds-footer ${w.expanded ? "dds-footer--expanded" : ""} ${service ? "dds-footer--selected" : ""}`}
    >
      <div className="dds-service-list">
        <strong>Службы:</strong>
        <div className="dds-service-grid">
          {dds.responses.slice(0, 8).map(serviceTile)}
        </div>
        {dds.responses.length > 8 && (
          <button
            className="arm-small-button dds-expand"
            aria-label={
              w.expanded
                ? "Свернуть службы"
                : `Все службы (${dds.responses.length})`
            }
            title={w.expanded ? "Свернуть службы" : "Показать все службы"}
            aria-expanded={w.expanded}
            onClick={() => w.setExpanded(!w.expanded)}
          >
            <span aria-hidden="true">
              ⌃<br />⌄
            </span>
          </button>
        )}
      </div>
      {w.expanded && (
        <div className="dds-extra-services" aria-label="Дополнительные службы">
          {dds.responses.slice(8).map(serviceTile)}
        </div>
      )}
      <div className="arm-footer-tools">
        {!completed && (
          <button
            className="arm-small-button"
            disabled={busy || !dds.allowed_statuses.length}
            onClick={() => w.openEditor()}
          >
            Изменить статус ДДС
          </button>
        )}
        {!completed && dds.can_finish && (
          <button
            className="arm-save"
            disabled={busy}
            onClick={() => w.finish.mutate()}
          >
            Завершить упражнение
          </button>
        )}
        <ArmIconButton
          icon="close"
          label="Закрыть карточку ДДС"
          onClick={w.close}
          disabled={busy}
        />
      </div>
      {service && (
        <div
          className="dds-crew-strip"
          aria-label={own ? "Бригады службы" : "Действия службы"}
        >
          {own &&
            dds.crews?.map((c) => (
              <DDSTile
                key={c.id}
                name={c.name}
                status={crewStatusLabels[c.status]}
                updatedAt={c.status_updated_at ?? c.history.at(-1)?.at}
                selected={activeCrew === c.crew_code}
                onClick={() => {
                  w.setActiveCrew(
                    activeCrew === c.crew_code ? "" : c.crew_code,
                  );
                  w.setServiceHistory(false);
                }}
              />
            ))}
          {own && canManage && (
            <button
              className="arm-small-button"
              disabled={busy || !available.length}
              onClick={() => w.openEditor("")}
            >
              + Назначить бригаду
            </button>
          )}
          {own && !dds.crews?.length && (
            <span className="dds-empty-crews">
              {(dds.profile.crews ?? []).length
                ? "Бригады пока не назначены"
                : "В профиле нет бригад"}
            </span>
          )}
          <button
            className="arm-small-button"
            aria-expanded={w.serviceHistory}
            onClick={() => {
              w.setServiceHistory(!w.serviceHistory);
              w.setActiveCrew("");
            }}
          >
            История службы
          </button>
        </div>
      )}
      {service && (crew || w.serviceHistory) && (
        <DDSResponseHistory workspace={w} />
      )}
    </footer>
  );
}
