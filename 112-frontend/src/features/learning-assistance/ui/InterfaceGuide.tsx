import { finishedHint } from "../lib/journalHints";
import type { LearningHelpProps } from "../types";
import { useInterfaceGuide } from "../model/useInterfaceGuide";
import { GuideSpotlight } from "./GuideSpotlight";
import "../styles/interface-guide.scss";

export function InterfaceGuide(props: LearningHelpProps) {
  const guide = useInterfaceGuide(props);
  if (!guide.active)
    return props.attempt.status === "completed" && !guide.paused ? (
      <GuideSpotlight
        hint={finishedHint}
        busy={false}
        error={null}
        onCheck={() => {}}
        hideCheck
        onPause={() => guide.setPaused(true)}
      />
    ) : null;
  return (
    <aside className="interface-guide-bar" aria-label="Освоение интерфейса">
      <strong>Освоение интерфейса</strong>
      <span>
        {props.attempt.dds
          ? "Действуйте в подсвеченной области. Статусы подтверждайте галочкой."
          : "Действуйте в подсвеченной области. Поля сохраняются автоматически."}
      </span>
      {guide.paused && (
        <button
          type="button"
          className="arm-small-button"
          onClick={() => guide.setPaused(false)}
        >
          Включить сопровождение
        </button>
      )}
      {!guide.paused && guide.hint && (
        <GuideSpotlight
          hint={guide.hint}
          busy={guide.busy}
          error={guide.error}
          onCheck={() => guide.check.mutate()}
          onPause={() => guide.setPaused(true)}
        />
      )}
      {!guide.paused && !guide.hint && (
        <span role="status">
          {guide.busy ? "Подготавливаем первый шаг…" : "Шаг пока недоступен."}
        </span>
      )}
      {!guide.paused && guide.error && (
        <span role="alert">
          {guide.error}{" "}
          <button type="button" onClick={() => guide.check.mutate()}>
            Повторить
          </button>
        </span>
      )}
    </aside>
  );
}
