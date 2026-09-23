import { useEffect, useState } from "react";
import type { DDSReactionTimeProps } from "../types/TrainingWorkspacePage";
import "../styles/dds-stream.scss";

export function DDSReactionTime({ assignment: a }: DDSReactionTimeProps) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (a.first_response_at || a.status !== "in_progress") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [a.first_response_at, a.status]);
  if (!a.received_at) return null;
  const seconds = Math.max(
    0,
    Math.floor(
      ((a.first_response_at ? Date.parse(a.first_response_at) : now) -
        Date.parse(a.received_at)) /
        1000,
    ),
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
