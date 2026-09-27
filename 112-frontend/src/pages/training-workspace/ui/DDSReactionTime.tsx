import { cardElapsedSeconds } from "@/entities/training";
import { useEffect, useState } from "react";
import type { DDSReactionTimeProps } from "../types/TrainingWorkspacePage";
import "../styles/dds-stream.scss";

export function DDSReactionTime({ assignment: a }: DDSReactionTimeProps) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (
      (a.dds_timing
        ? a.dds_timing.first_record.at && a.dds_timing.opening.at
        : a.first_response_at) ||
      a.status !== "in_progress"
    )
      return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [a.first_response_at, a.status, a.dds_timing]);
  if (!a.received_at) return null;
  if (a.dds_timing)
    return (
      <span className="dds-timing-summary">
        {(["opening", "first_record"] as const).map((key) => {
          const m = a.dds_timing![key];
          const elapsed =
            m.at || a.status !== "in_progress"
              ? m.seconds
              : cardElapsedSeconds(
                  { started_at: a.received_at!, pauses: a.card?.pauses },
                  now,
                );
          const late =
            elapsed > m.norm_seconds || (!m.at && a.status !== "in_progress");
          return (
            <span
              key={key}
              className={`dds-reaction-time${late ? " dds-reaction-time--late" : ""}`}
            >
              {key === "opening" ? "Открытие" : "Запись"}:{" "}
              {!m.at && a.status !== "in_progress"
                ? "нет"
                : `${Math.floor(elapsed)} с`}{" "}
              / {m.norm_seconds} с
            </span>
          );
        })}
      </span>
    );
  const seconds = cardElapsedSeconds(
    { started_at: a.received_at, pauses: a.card?.pauses },
    a.first_response_at ? Date.parse(a.first_response_at) : now,
  );
  const missing = !a.first_response_at && a.status !== "in_progress";
  const late = missing || seconds > (a.response_norm_seconds ?? 30);
  return (
    <span
      className={`dds-reaction-time${late ? " dds-reaction-time--late" : ""}`}
      title={
        missing
          ? "Первый статус не введён"
          : `${a.first_response_at ? "Первая реакция" : "Ожидание первого статуса"}: ${seconds} с; норматив ${a.response_norm_seconds ?? 30} с`
      }
    >
      {missing ? "—" : `${seconds} с`}
    </span>
  );
}
