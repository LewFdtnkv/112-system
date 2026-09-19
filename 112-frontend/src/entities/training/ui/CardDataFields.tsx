import type { CardData } from "../model/types";

import { fieldLabels } from "../model/fieldLabels";

export function CardDataFields({ data }: { data: CardData }) {
  const flatten = (value: unknown, prefix: string): [string, string][] => {
    if (value === null || value === undefined || value === "") return [];
    if (Array.isArray(value)) return [[prefix, value.map(String).join(", ")]];
    if (typeof value === "object")
      return Object.entries(value).flatMap(([k, v]) =>
        flatten(v, [prefix, fieldLabels[k] ?? k].filter(Boolean).join(" / ")),
      );
    return [
      [
        prefix,
        typeof value === "boolean" ? (value ? "Да" : "Нет") : String(value),
      ],
    ];
  };
  return (
    <dl>
      {flatten(data, "").map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
