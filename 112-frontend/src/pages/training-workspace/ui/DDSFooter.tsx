import { crewStatusLabels } from "@/entities/training";
import { ArmIconButton } from "@/shared/ui/arm";
import { useDDSWorkspaceStore } from "../model/DDSWorkspaceContext";
import { DDSResponseHistory } from "./DDSResponseHistory";
import { DDSTile } from "./DDSTile";

export function DDSFooter() {
  const w = useDDSWorkspaceStore((state) => state);
  const { dds, completed, busy, activeService, activeCrew } = w;
  const own = activeService === dds.profile.service_id;
  const service = dds.responses.find((r) => r.service_id === activeService);
  const crew = own
    ? dds.crews?.find((c) => c.crew_code === activeCrew)
    : undefined;
  const canManage =
    !completed &&
    (dds.workflow === "crews-v1" ||
      ["accepted", "responding", "arrived", "in_progress"].includes(
        dds.status,
      ));
  const available = (dds.profile.crews ?? []).filter(
    (c) => c.is_active && !dds.crews?.some((a) => a.crew_code === c.code),
  );
  const anyOpen = w.expanded || Boolean(activeService) || Boolean(activeCrew);
  const selectService = (id: string) => {
    w.setActiveService(activeService === id ? "" : id);
    w.setActiveCrew("");
  };
  const serviceTile = (r: (typeof dds.responses)[number]) => (
    <DDSTile
      key={r.service_id}
      name={r.short_name || r.name}
      title={r.name}
      status="Добавлена"
      updatedAt={r.added_at}
      selected={activeService === r.service_id}
      onClick={() => selectService(r.service_id)}
    />
  );
  return (
    <footer
      className={`arm-card-footer arm-card-footer--view dds-footer ${w.expanded ? "dds-footer--expanded" : ""} ${service ? "dds-footer--selected" : ""}`}
    >
      <div className="dds-service-list" data-learning-target="dds_crews">
        <strong>Службы:</strong>
        <div className="dds-service-grid">
          {dds.responses.slice(0, 8).map(serviceTile)}
        </div>
        <ArmIconButton
          icon={anyOpen ? "collapse" : "expand"}
          className="dds-expand dds-footer-control"
          label={
            anyOpen
              ? "Свернуть все службы и бригады"
              : `Все службы (${dds.responses.length})`
          }
          disabled={!anyOpen && dds.responses.length <= 8}
          aria-expanded={anyOpen}
          onClick={() => (anyOpen ? w.collapseAll() : w.setExpanded(true))}
        />
      </div>
      {w.expanded && (
        <div className="dds-extra-services" aria-label="Дополнительные службы">
          {dds.responses.slice(8).map(serviceTile)}
        </div>
      )}
      <div className="arm-footer-tools">
        {!completed && dds.can_finish && (
          <button
            className="arm-save"
            data-learning-target="submit"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Завершить упражнение? Невыполненные действия будут учтены в оценке.",
                )
              )
                w.finish.mutate();
            }}
          >
            Завершить упражнение
          </button>
        )}
        <ArmIconButton
          icon="close"
          label="Закрыть карточку ДДС"
          className="dds-footer-control"
          onClick={w.close}
          disabled={busy}
        />
      </div>
      {own && service && (
        <div
          data-learning-target="dds_response"
          className="dds-crew-strip"
          aria-label="Бригады службы"
        >
          {own &&
            dds.crews?.map((c) => (
              <DDSTile
                key={c.id}
                name={c.name}
                kind="crew"
                onEdit={() => w.openEditor(c.crew_code)}
                editDisabled={busy || !canManage || !c.allowed_statuses.length}
                status={crewStatusLabels[c.status]}
                updatedAt={c.status_updated_at ?? c.history.at(-1)?.at}
                selected={activeCrew === c.crew_code}
                onClick={() => {
                  w.setActiveCrew(
                    activeCrew === c.crew_code ? "" : c.crew_code,
                  );
                }}
              />
            ))}
          {own &&
            canManage &&
            (!w.attempt.exercise_scope ||
              w.attempt.exercise_scope.includes("dds_crews")) && (
              <button
                data-learning-target="dds_crews"
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
        </div>
      )}
      {crew && <DDSResponseHistory />}
    </footer>
  );
}
