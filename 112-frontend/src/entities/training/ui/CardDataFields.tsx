import type { CardData } from "../model/types";
import type { FeatureDefinition } from "@/shared/lib/featureValues";
import { flattenCardData } from "../model/cardFields";

export function CardDataFields({
  data,
  features,
}: {
  data: CardData;
  features?: FeatureDefinition[];
}) {
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
