import { dialoguePhaseLabels } from "../model/dialogueLabels";
import type { DialogueStatusProps } from "../types/crewCallProgress";
export function DialogueStatus({ phase }: DialogueStatusProps) {
  return phase ? (
    <span>{dialoguePhaseLabels[phase] ?? "Подготовка разговора…"}</span>
  ) : null;
}
