import { formatDuration } from "@/shared/lib/formatDuration";
import type { DDSReactionClockProps } from "../types/DDSReactionClock";
import "../styles/dds-reaction-clock.scss";

export function DDSReactionClock({
  label,
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
      aria-label={label ? `Таймер: ${label}` : "Таймер первой реакции"}
    >
      <span>{label ?? "Первая реакция"}</span>
      <strong>{formatDuration(elapsed)}</strong>
      <span>
        {norm != null
          ? `Норматив ${formatDuration(norm)}`
          : "От поступления карточки"}
      </span>
      <span>
        {missing
          ? label
            ? "Не выполнено"
            : "Статус не введён"
          : responded
            ? label
              ? "Выполнено"
              : "Первый статус введён"
            : label
              ? "Ожидание"
              : "До первого статуса"}
      </span>
      {late && <span>Норматив нарушен</span>}
    </div>
  );
}
