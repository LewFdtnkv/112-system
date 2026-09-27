import { useDDSWorkspaceContext } from "../model/DDSWorkspaceContext";
import type { DDSCrewMessagesProps } from "../types/DDSCrewMessages";

export function DDSCrewMessages({
  crewCode,
  unassignedOnly,
}: DDSCrewMessagesProps) {
  const dds = useDDSWorkspaceContext().dds;
  const messages = (dds.crew_messages ?? []).filter((m) =>
    crewCode
      ? m.crew_code === crewCode
      : !unassignedOnly || !dds.crews?.some((c) => c.crew_code === m.crew_code),
  );
  if (!messages.length) return null;
  return (
    <section
      className={`dds-crew-messages ${unassignedOnly ? "dds-crew-messages--unassigned" : ""}`}
      aria-label="Сообщения по бригадам"
    >
      <strong>Полученные сообщения</strong>
      {messages.map((message, i) => (
        <div key={i} className="dds-crew-message">
          {!crewCode && (
            <b>
              {
                dds.profile.crews?.find((c) => c.code === message.crew_code)
                  ?.name
              }
            </b>
          )}
          <p>{message.message}</p>
        </div>
      ))}
      <small>
        Отразите сведения в статусах бригад. Эти сообщения не являются записями
        истории.
      </small>
    </section>
  );
}
