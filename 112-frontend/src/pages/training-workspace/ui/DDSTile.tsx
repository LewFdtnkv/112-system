import { ddsTime } from "../lib/ddsTime";
import type { DDSTileProps } from "../types/DDSTile";

export function DDSTile({
  name,
  title,
  status,
  updatedAt,
  selected,
  onClick,
  kind = "service",
  onEdit,
  editDisabled,
}: DDSTileProps) {
  return (
    <div className={`dds-tile-shell dds-tile-shell--${kind}`}>
      <button
        type="button"
        className={`arm-service-tile ${selected ? `dds-${kind}-active` : ""}`}
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
      {onEdit && (
        <ArmIconButton
          icon="edit"
          label={`Изменить статус бригады «${name}»`}
          className="dds-tile-edit"
          disabled={editDisabled}
          onClick={onEdit}
        />
      )}
    </div>
  );
}
import { ArmIconButton } from "@/shared/ui/arm";
