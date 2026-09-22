import { ddsTime } from "../lib/ddsTime";
import type { DDSTileProps } from "../types/DDSTile";

export function DDSTile({
  name,
  title,
  status,
  updatedAt,
  selected,
  onClick,
}: DDSTileProps) {
  return (
    <button
      type="button"
      className={`arm-service-tile ${selected ? "dds-service-active" : ""}`}
      title={`${title || name}\n${ddsTime(updatedAt, true)} ${status}`}
      aria-expanded={selected}
      onClick={onClick}
    >
      <span aria-hidden="true">{selected ? "⌄" : "⌃"}</span>
      <strong>{name}</strong>
      <small>
        <time dateTime={updatedAt}>{ddsTime(updatedAt)}</time> {status}
      </small>
    </button>
  );
}
