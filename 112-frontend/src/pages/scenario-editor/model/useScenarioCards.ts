import { useState } from "react";
import type { ScenarioDetail } from "@/entities/training";
import type { SelectOption } from "@/shared/ui/ServerSelect";

export function useScenarioCards(initial?: ScenarioDetail) {
  const [cards, setCards] = useState<SelectOption[]>(
    () =>
      initial?.cards.map((c) => ({
        id: c.card_template_id,
        label: c.snapshot.title,
      })) ?? [],
  );
  const [delays, setDelays] = useState<number[]>(
    () =>
      initial?.cards.map((c, i, all) =>
        i === 0
          ? 0
          : (c.arrival_offset_seconds ?? i * 60) -
            (all[i - 1].arrival_offset_seconds ?? (i - 1) * 60),
      ) ?? [],
  );
  const [choice, setChoice] = useState<SelectOption | null>(null);
  const offsets = delays.map((_, i) =>
    delays.slice(0, i + 1).reduce((a, b) => a + b, 0),
  );
  return {
    cards,
    choice,
    setChoice,
    delays,
    offsets,
    changeDelay: (index: number, value: number) =>
      setDelays((current) => current.map((v, i) => (i === index ? value : v))),
    add: () => {
      if (!choice) return;
      setCards((current) => [...current, choice]);
      setDelays((current) => [...current, current.length ? 60 : 0]);
      setChoice(null);
    },
    remove: (index: number) => {
      setCards((current) => current.filter((_, i) => i !== index));
      setDelays((current) =>
        current.filter((_, i) => i !== index).map((v, i) => (i === 0 ? 0 : v)),
      );
    },
    move: (index: number, step: number) =>
      setCards((current) => {
        const next = [...current];
        [next[index], next[index + step]] = [next[index + step], next[index]];
        return next;
      }),
  };
}
