import type { Props } from "../types/CardServiceTile";

export function CardServiceTile({
  name,
  shortName,
  status,
  expanded,
  onClick,
}: Props) {
  return (
    <button
      className="arm-service-tile"
      aria-expanded={expanded}
      title={name}
      onClick={onClick}
    >
      <span aria-hidden="true">⌃</span>
      <strong>{shortName || name}</strong>
      <small>{status}</small>
    </button>
  );
}
