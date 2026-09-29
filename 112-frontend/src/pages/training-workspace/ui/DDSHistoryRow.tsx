import { ddsTime } from "../lib/ddsTime";
import type { DDSHistoryRowProps } from "../types/DDSHistoryRow";

export function DDSHistoryRow({
  at,
  status,
  comment,
  crewNumber,
}: DDSHistoryRowProps) {
  return (
    <div
      className="dds-history-row"
      title={crewNumber ? `Наряд ${crewNumber}` : undefined}
    >
      <span className="dds-history-operator">оп. 0</span>
      <span className="dds-history-arrow" aria-hidden="true">
        ›
      </span>
      <span className="dds-history-event">
        <time dateTime={at}>{ddsTime(at, true)}</time> <b>{status}</b>
      </span>
      {comment && (
        <>
          <span className="dds-history-arrow" aria-hidden="true">
            ›
          </span>
          <span className="dds-history-comment">{comment}</span>
        </>
      )}
    </div>
  );
}
