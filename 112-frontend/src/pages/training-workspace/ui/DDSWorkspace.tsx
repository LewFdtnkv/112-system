import { DDSWorkspaceContext } from "../model/DDSWorkspaceContext";
import { crewStatusLabels } from "@/entities/training";
import { attemptCard } from "@/features/incident-editing";
import { getApiError } from "@/shared/api";
import { IncidentCardDialog } from "@/widgets/incident-card";
import { useDDSWorkspace } from "../model/useDDSWorkspace";
import "../styles/dds-workspace.scss";
import type { DDSWorkspaceProps } from "../types/DDSWorkspace";
import { DDSFooter } from "./DDSFooter";
import { DDSStatusEditor } from "./DDSStatusEditor";

export function DDSWorkspace(props: DDSWorkspaceProps) {
  const workspace = useDDSWorkspace(props);
  const { attempt, dds, completed, elapsed, error, busy, reload, close } =
    workspace;
  return (
    <DDSWorkspaceContext value={workspace}>
      <IncidentCardDialog
        card={attemptCard(attempt)}
        log={[]}
        readOnly
        isSubmitted={completed}
        isCallAccepted
        onClose={close}
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
              {(dds.crew_goals ?? []).map((g) => (
                <p key={g.crew_code}>
                  Бригада {g.name}: {crewStatusLabels[g.status]}
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
                  onClick={reload}
                  disabled={busy}
                >
                  Обновить карточку
                </button>
              </p>
            )}
          </section>
        }
        responseFooter={<DDSFooter />}
      />
      <DDSStatusEditor />
    </DDSWorkspaceContext>
  );
}
