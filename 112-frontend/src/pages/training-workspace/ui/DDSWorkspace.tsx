import { LeaveLessonButton } from "./LeaveLessonButton";
import { TrainingPanel } from "./TrainingPanel";
import { DDSArrivalStatus } from "./DDSArrivalStatus";
import { Telephone } from "@/features/telephone";
import { LearningHelp } from "@/features/learning-assistance";
import { DDSWorkspaceStoreProvider } from "../model/DDSWorkspaceContext";
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
    <DDSWorkspaceStoreProvider value={workspace}>
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
          highlightTarget: workspace.highlight,
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
          <TrainingPanel
            navigation={
              props.lesson?.delivery === "dds-stream-v1" && (
                <>
                  <DDSArrivalStatus lesson={props.lesson} />
                  <nav
                    className="dds-card-navigation"
                    aria-label="Поступившие карточки"
                  >
                    {props.lesson.assignments
                      .filter((a) => a.attempt_id)
                      .map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          className="arm-small-button"
                          aria-current={
                            a.attempt_id === attempt.id ? "page" : undefined
                          }
                          disabled={busy || a.attempt_id === attempt.id}
                          onClick={() => {
                            if (
                              !workspace.editing ||
                              window.confirm(
                                "Перейти к другой карточке? Несохранённая запись статуса будет потеряна.",
                              )
                            )
                              props.onSelectAssignment?.(a);
                          }}
                        >
                          Карточка {a.position} ·{" "}
                          {a.status === "in_progress"
                            ? "в работе"
                            : "завершена"}
                        </button>
                      ))}
                  </nav>
                </>
              )
            }
            condition={
              <>
                {dds.profile.name} · {dds.goal}
                {!completed && dds.information && (
                  <p>{dds.information.message}</p>
                )}
              </>
            }
            instruction={attempt.instructions}
            reference={
              <details>
                <summary>
                  Памятка службы ·{" "}
                  {dds.reaction_norm_seconds != null
                    ? `первая реакция: ${elapsed} с / норматив ${dds.reaction_norm_seconds} с`
                    : `первичное решение: ${elapsed} с от направления`}
                </summary>
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
              </details>
            }
          >
            <LeaveLessonButton disabled={busy || workspace.editing} />
            <Telephone attemptId={attempt.id} completed={completed} />
            <LearningHelp
              attempt={attempt}
              busy={busy || workspace.editing}
              activity={workspace.activity}
              onHighlight={workspace.setHighlight}
            />
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
          </TrainingPanel>
        }
        responseFooter={<DDSFooter />}
      />
      <DDSStatusEditor />
    </DDSWorkspaceStoreProvider>
  );
}
