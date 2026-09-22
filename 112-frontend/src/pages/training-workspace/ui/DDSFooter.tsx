import { crewStatusLabels, ddsStatusLabels } from "@/entities/training";
import { ArmIconButton } from "@/shared/ui/arm";
import type { DDSControlsProps } from "../types/DDSControls";

export function DDSFooter({ workspace: w }: DDSControlsProps) {
  const { dds, completed, busy, activeService, activeCrew } = w;
  const own = activeService === dds.profile.service_id;
  const service = dds.responses.find((r) => r.service_id === activeService);
  const crew = own
    ? dds.crews?.find((c) => c.crew_code === activeCrew)
    : undefined;
  const history = crew ? crew.history : own ? dds.history : [];
  const labels = crew ? crewStatusLabels : ddsStatusLabels;
  const canManage =
    !completed &&
    ["accepted", "responding", "arrived", "in_progress"].includes(dds.status);
  const directory = dds.profile.crews ?? [];
  const available = directory.filter(
    (c) => c.is_active && !dds.crews?.some((a) => a.crew_code === c.code),
  );
  const contact = dds.profile.contacts.find(
    (c) => c.code === crew?.contact_code,
  );
  return (
    <footer
      className={`arm-card-footer arm-card-footer--view dds-footer ${w.expanded ? "dds-footer--expanded" : ""}`}
    >
      <div
        className={`dds-service-list ${w.expanded ? "dds-service-list--expanded" : ""}`}
      >
        <strong>Службы:</strong>
        <div className="dds-service-grid">
          {dds.responses.slice(0, 8).map((r) => (
            <button
              key={r.service_id}
              className={`arm-service-tile ${activeService === r.service_id ? "dds-service-active" : ""}`}
              title={r.name}
              aria-expanded={activeService === r.service_id}
              onClick={() => {
                w.setActiveService(
                  activeService === r.service_id ? "" : r.service_id,
                );
                w.setActiveCrew("");
              }}
            >
              <span>⌃</span>
              <strong>{r.short_name || r.name}</strong>
              <small>{ddsStatusLabels[r.status]}</small>
            </button>
          ))}
        </div>
        {dds.responses.length > 8 && (
          <button
            className="arm-small-button dds-expand"
            aria-expanded={w.expanded}
            onClick={() => w.setExpanded(!w.expanded)}
          >
            {w.expanded
              ? "Свернуть службы"
              : `Все службы (${dds.responses.length})`}
          </button>
        )}
      </div>
      {w.expanded && (
        <div className="dds-extra-services" aria-label="Дополнительные службы">
          {dds.responses.slice(8).map((r) => (
            <button
              key={r.service_id}
              title={r.name}
              className={`arm-service-tile ${activeService === r.service_id ? "dds-service-active" : ""}`}
              aria-expanded={activeService === r.service_id}
              onClick={() => {
                w.setActiveService(
                  activeService === r.service_id ? "" : r.service_id,
                );
                w.setActiveCrew("");
              }}
            >
              <span>⌃</span>
              <strong>{r.short_name || r.name}</strong>
              <small>{ddsStatusLabels[r.status]}</small>
            </button>
          ))}
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
        <section
          className="dds-response-panel"
          aria-label="Реагирование службы"
        >
          <header>
            <strong>{service.name}</strong>
            <ArmIconButton
              icon="close"
              label="Закрыть историю службы"
              onClick={() => w.setActiveService("")}
            />
          </header>
          {own && (
            <div className="dds-crew-strip" aria-label="Бригады службы">
              <button
                className={`arm-service-tile ${!crew ? "dds-service-active" : ""}`}
                onClick={() => w.setActiveCrew("")}
                aria-pressed={!crew}
              >
                <strong>Служба</strong>
                <small>{ddsStatusLabels[dds.status]}</small>
              </button>
              {dds.crews?.map((c) => (
                <button
                  key={c.id}
                  title={c.name}
                  className={`arm-service-tile ${activeCrew === c.crew_code ? "dds-service-active" : ""}`}
                  aria-pressed={activeCrew === c.crew_code}
                  onClick={() =>
                    w.setActiveCrew(
                      activeCrew === c.crew_code ? "" : c.crew_code,
                    )
                  }
                >
                  <strong>{c.name}</strong>
                  <small>{crewStatusLabels[c.status]}</small>
                  <small>{c.crew_number ? `Наряд ${c.crew_number}` : ""}</small>
                </button>
              ))}
              {canManage && (
                <button
                  className="arm-small-button"
                  disabled={busy || !available.length}
                  onClick={() => w.openEditor("")}
                >
                  + Назначить бригаду
                </button>
              )}
            </div>
          )}
          {own && !directory.length && (
            <p className="dds-panel-note">
              В этой версии профиля бригады не настроены. Доступна работа с
              номером наряда службы.
            </p>
          )}
          <div
            className="dds-history"
            aria-label={crew ? "История бригады" : "История статусов ДДС"}
          >
            <header>
              <b>{crew ? crew.name : "История службы"}</b>
              {own &&
                !completed &&
                (crew
                  ? canManage && crew.allowed_statuses.length > 0
                  : dds.allowed_statuses.length > 0) && (
                  <ArmIconButton
                    icon="edit"
                    label={
                      crew
                        ? "Изменить статус бригады"
                        : "Редактировать статус службы"
                    }
                    disabled={busy}
                    onClick={() => w.openEditor(crew?.crew_code)}
                  />
                )}
            </header>
            {crew && (
              <p>
                {crew.description}
                {contact && (
                  <>
                    {" "}
                    · Старший: {contact.name} {contact.position}
                  </>
                )}
              </p>
            )}
            {!crew && (
              <p>
                Получена службой ·{" "}
                {new Date(dds.sent_at).toLocaleTimeString("ru-RU", {
                  timeZone: "Europe/Moscow",
                })}{" "}
                МСК
              </p>
            )}
            {history.map((e) => (
              <div className="dds-history-row" key={e.id}>
                <time>
                  {new Date(e.at).toLocaleTimeString("ru-RU", {
                    timeZone: "Europe/Moscow",
                  })}
                </time>
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
                  "Изменять эту службу нельзя: она не назначена в задании."}
              </p>
            )}
          </div>
        </section>
      )}
    </footer>
  );
}
