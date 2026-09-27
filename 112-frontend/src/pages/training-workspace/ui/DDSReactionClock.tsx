import { formatDuration } from "@/shared/lib/formatDuration";
import type { DDSReactionClockProps } from "../types/DDSReactionClock";
import "../styles/dds-reaction-clock.scss";

export function DDSReactionClock({
  elapsed,
  norm,
  responded,
  completed,
}: DDSReactionClockProps) {
  const missing = completed && !responded;
  const late = norm != null && (elapsed > norm || missing);
  return (
    <div
      className={`dds-reaction-clock${late ? " is-overdue" : ""}`}
      aria-label="Таймер первой реакции"
    >
      <span>Первая реакция</span>
      <strong>{formatDuration(elapsed)}</strong>
      <span>
        {norm != null
          ? `Норматив ${formatDuration(norm)}`
          : "От поступления карточки"}
      </span>
      <span>
        {missing
          ? "Статус не введён"
          : responded
            ? "Первый статус введён"
            : "До первого статуса"}
      </span>
      {late && <span>Норматив нарушен</span>}
    </div>
  );
}
