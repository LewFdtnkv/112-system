import { crewStatusLabels } from "@/entities/training";
import { ArmIconButton } from "@/shared/ui/arm";
import { useDDSWorkspaceContext } from "../model/DDSWorkspaceContext";
import { DDSCrewMessages } from "./DDSCrewMessages";
import { DDSHistoryRow } from "./DDSHistoryRow";

export function DDSResponseHistory() {
  const w = useDDSWorkspaceContext();
  const crew = w.dds.crews?.find((c) => c.crew_code === w.activeCrew);
  if (!crew) return null;
  return (
    <section className="dds-response-panel" aria-label="История бригады">
      <header>
        <strong>{crew.name}</strong>
        <ArmIconButton
          icon="close"
          label="Закрыть историю бригады"
          onClick={() => w.setActiveCrew("")}
        />
      </header>
      <DDSCrewMessages crewCode={crew.crew_code} />
      <div className="dds-history">
        {crew.history.map((e) => (
          <DDSHistoryRow
            key={e.id}
            at={e.at}
            status={crewStatusLabels[e.status]}
            comment={e.comment}
            crewNumber={e.crew_number}
          />
        ))}
      </div>
    </section>
  );
}
