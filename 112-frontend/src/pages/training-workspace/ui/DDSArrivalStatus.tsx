import type { WorkspaceProps } from "../types/TrainingWorkspacePage";
import "../styles/dds-stream.scss";

export function DDSArrivalStatus({ lesson }: WorkspaceProps) {
  const received = lesson.assignments.filter((a) => a.received_at);
  const waiting = received.filter(
    (a) => !a.first_opened_at && a.status === "in_progress",
  ).length;
  const active = received.filter(
    (a) => a.first_opened_at && a.status === "in_progress",
  ).length;
  return (
    <p className="dds-arrival-status" role="status" aria-live="polite">
      Поступило: {received.length} из {lesson.assignments.length} · Ожидают
      открытия: {waiting} · В работе: {active}
      {received.length < lesson.assignments.length &&
        " · Новые карточки появятся автоматически"}
    </p>
  );
}
