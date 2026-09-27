import { cardElapsedSeconds } from "@/entities/training";
import type { DDSTimingClocksProps } from "../types/DDSReactionClock";
import { DDSReactionClock } from "./DDSReactionClock";

export function DDSTimingClocks({ attempt, now }: DDSTimingClocksProps) {
  const timing = attempt.dds?.timing;
  if (!timing) return null;
  return (
    <div className="dds-timing-clocks">
      {(["opening", "first_record"] as const).map((key) => {
        const measure = timing[key];
        return (
          <DDSReactionClock
            key={key}
            label={key === "opening" ? "Открытие карточки" : "Статус с текстом"}
            elapsed={cardElapsedSeconds(
              attempt,
              measure.at
                ? Date.parse(measure.at)
                : attempt.ended_at
                  ? Date.parse(attempt.ended_at)
                  : now,
            )}
            norm={measure.norm_seconds}
            responded={!!measure.at}
            completed={attempt.status !== "in_progress"}
          />
        );
      })}
    </div>
  );
}
