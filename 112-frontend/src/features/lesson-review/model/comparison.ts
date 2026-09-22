import { cardFieldOrder, flattenCardData } from "@/entities/training";
import type { FieldFeedbackMap } from "@/shared/ui/arm/FieldFeedback";
import type { ComparisonField, ReviewedCard } from "../types/comparison";
const groups = [
  "Заявитель",
  "Адрес происшествия",
  "Происшествие и признаки",
  "Оповещение служб",
  "Действия ДДС",
  "Дополнительные сведения",
];
const groupFor = (path: string) =>
  path.startsWith("caller")
    ? groups[0]
    : path.startsWith("address")
      ? groups[1]
      : path === "recipients"
        ? groups[3]
        : path.startsWith("dds.")
          ? groups[4]
          : /^(classifier|description|features|victim)/.test(path)
            ? groups[2]
            : groups[5];

export function comparisonFields(row: ReviewedCard): ComparisonField[] {
  const fields = new Map<string, ComparisonField>();
  const definitions = row.source_snapshot?.feature_definitions ?? [];
  for (const [side, data] of [
    ["expected", row.source_snapshot?.data],
    ["actual", row.attempt?.card.data],
  ] as const) {
    if (!data) continue;
    for (const item of flattenCardData(data, definitions)) {
      const previous = fields.get(item.field) ?? {
        field: item.field,
        label: item.label,
        expected: "",
        actual: "",
        status: "unscored",
        scored: false,
        group: groupFor(item.field),
      };
      fields.set(item.field, { ...previous, [side]: item.value });
    }
  }
  const entry = row.source_classifier_entry;
  fields.set("classifier_entry_id", {
    field: "classifier_entry_id",
    label: "Тип происшествия",
    expected: entry?.display_name || entry?.name || "",
    actual:
      row.attempt?.classifier_entry?.display_name ||
      row.attempt?.classifier_entry?.name ||
      "",
    status: "unscored",
    scored: false,
    group: groups[2],
  });
  fields.set("recipients", {
    field: "recipients",
    label: "Оповещённые службы",
    expected:
      row.source_snapshot?.recipients?.map((s) => s.name).join(", ") ?? "",
    actual: row.attempt?.notified_services.map((s) => s.name).join(", ") ?? "",
    status: "unscored",
    scored: false,
    group: groups[3],
  });
  for (const field of row.automatic_check?.fields ?? []) {
    fields.set(field.field, { ...field, group: groupFor(field.field) });
  }
  return [...fields.values()].sort(
    (a, b) =>
      groups.indexOf(a.group) - groups.indexOf(b.group) ||
      cardFieldOrder(a.field, definitions) -
        cardFieldOrder(b.field, definitions),
  );
}
export function fieldVerdict(field: ComparisonField, submitted = true) {
  if (field.status === "unscored")
    return { tone: "neutral", label: "Вне автопроверки", symbol: "—" } as const;
  if (field.status === "matched")
    return { tone: "success", label: "Совпало", symbol: "✓" } as const;
  if (field.status === "needs_review" || !field.scored)
    return { tone: "warning", label: "Проверить смысл", symbol: "?" } as const;
  if (field.status === "missing" && !submitted)
    return {
      tone: "warning",
      label: "Пока не заполнено",
      symbol: "…",
    } as const;
  return {
    tone: "error",
    label: field.status === "missing" ? "Не заполнено" : "Расхождение",
    symbol: "!",
  } as const;
}
export function comparisonFeedback(row: ReviewedCard): FieldFeedbackMap {
  const names: Record<string, string> = {
    caller_name: "Заявитель",
    caller_phone: "Предоставленный",
    description: "Описание со слов заявителя",
    "features.victimsCount": "Пострадавших",
    "address_details.house": "Дом/Вл",
    "address_details.building": "Корпус/Стр",
    "address_details.structure": "Стр/соор",
    "address_details.apartment": "Квартира/офис",
    "address_details.doorCode": "Код",
    "address_details.description": "Описательный адрес",
  };
  return Object.fromEntries(
    comparisonFields(row)
      .filter((f) => f.status !== "unscored")
      .map((f) => {
        const verdict = fieldVerdict(f, row.attempt?.status !== "in_progress");
        const key =
          names[f.field] ??
          (f.field.startsWith("features.ekp.")
            ? `feature:${f.field.slice(13)}`
            : f.label);
        return [
          key,
          {
            tone: verdict.tone,
            text: `${verdict.symbol} ${verdict.label}. Эталонное решение: ${f.expected || "—"}`,
          },
        ];
      }),
  );
}

export type { ComparisonField, ReviewedCard } from "../types/comparison";
