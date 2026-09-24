import { useGuideSession } from "../model/guideSession";
import { journalHint } from "../lib/journalHints";
import type { JournalGuideProps } from "../types/guide";
import { GuideSpotlight } from "./GuideSpotlight";
import "../styles/interface-guide.scss";
export function JournalGuide({ mode }: JournalGuideProps) {
  const { paused, setPaused } = useGuideSession();
  if (paused)
    return (
      <button
        type="button"
        className="arm-small-button"
        onClick={() => setPaused(false)}
      >
        Включить сопровождение
      </button>
    );
  return (
    <GuideSpotlight
      hint={journalHint(mode)}
      busy={false}
      error={null}
      onPause={() => setPaused(true)}
      onCheck={() => {}}
      hideCheck
    />
  );
}
