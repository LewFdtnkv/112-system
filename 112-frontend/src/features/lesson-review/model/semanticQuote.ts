import { crewStatusLabels } from "@/entities/training";

/** Older assessments cite frozen crew records. Present their content, not JSON. */
export function semanticQuote(quote: string): string {
  try {
    const records: unknown = JSON.parse(quote);
    if (!Array.isArray(records) || !records.length) return quote;
    if (
      !records.every(
        (record) =>
          record &&
          typeof record === "object" &&
          typeof record.crew === "string" &&
          typeof record.status === "string" &&
          typeof record.comment === "string",
      )
    )
      return quote;
    return records
      .map(
        (record) =>
          `${record.crew} · ${crewStatusLabels[record.status] ?? record.status}: ${record.comment || "Без комментария"}`,
      )
      .join("\n");
  } catch {
    return quote;
  }
}
