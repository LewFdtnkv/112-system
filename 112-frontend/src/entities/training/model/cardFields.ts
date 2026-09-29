import type { FeatureDefinition } from "@/shared/lib/featureValues";
import { fieldLabels } from "./fieldLabels";
import type { CardData } from "./types";

const orderedFields = [
  "caller_name",
  "caller_phone",
  "address_text",
  "address_details.country",
  "address_details.region",
  "address_details.locality",
  "address_details.object",
  "address_details.district",
  "address_details.area",
  "address_details.street",
  "address_details.house",
  "address_details.building",
  "address_details.structure",
  "address_details.apartment",
  "address_details.entrance",
  "address_details.floor",
  "address_details.doorCode",
  "address_details.description",
  "classifier_entry_id",
  "description",
  "victim_details",
  "features.victimsCount",
];
export function cardFieldOrder(
  field: string,
  features: FeatureDefinition[] = [],
) {
  const index = [
    ...orderedFields,
    ...features.map((f) => `features.ekp.${f.key}`),
  ].indexOf(field);
  return index < 0 ? 1000 : index;
}

export function flattenCardData(
  data: CardData,
  features: FeatureDefinition[] = [],
) {
  const labels = {
    ...fieldLabels,
    ...Object.fromEntries(features.map((f) => [f.key, f.label])),
  };
  const result: { field: string; label: string; value: string }[] = [];
  function visit(value: unknown, path: string[], names: string[]) {
    if (value === null || value === undefined || value === "") return;
    if (typeof value === "object" && !Array.isArray(value)) {
      Object.entries(value).forEach(([key, child]) =>
        visit(
          child,
          [...path, key],
          key === "ekp"
            ? names
            : [
                ...names,
                key === "description" && path[0] === "address_details"
                  ? "Уточнение адреса"
                  : (labels[key] ?? key),
              ],
        ),
      );
    } else {
      result.push({
        field: path.join("."),
        label: names.join(" / "),
        value: Array.isArray(value)
          ? value.map(String).join(", ")
          : typeof value === "boolean"
            ? value
              ? "Да"
              : "Нет"
            : String(value),
      });
    }
  }
  visit(data, [], []);
  return result.sort(
    (a, b) =>
      cardFieldOrder(a.field, features) - cardFieldOrder(b.field, features),
  );
}
