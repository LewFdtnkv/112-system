import { flattenCardData } from "../model/cardFields";
import type { CardDataFieldsProps } from "../types/CardDataFields";

export function CardDataFields({ data, features }: CardDataFieldsProps) {
  return (
    <dl className="card-data-fields">
      {flattenCardData(data, features).map(({ field, label, value }) => (
        <div key={field}>
          <dt>{label}</dt>
          <dd>{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
