import {
  emptyCardFields,
  emptyIncidentAddress,
  emptyIncidentPhones,
  formatAddress,
  type IncidentCard,
  type IncidentCardFields,
} from "@/entities/incident-card";
import type { Attempt, CardData, JournalCard } from "@/entities/training";
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const strings = (value: unknown) =>
  Object.fromEntries(
    Object.entries(record(value)).filter(([, v]) => typeof v === "string"),
  ) as Record<string, string>;
export function attemptCard(attempt: Attempt): IncidentCard {
  const { data } = attempt.card;
  const extra = record(data.additional_fields);
  const details = record(extra.details);
  const phones = strings(data.caller_details);
  const address = strings(data.address_details);
  return {
    id: attempt.card.id,
    displayNumber: attempt.card.id.slice(0, 8),
    createdDate: new Date(attempt.started_at).toLocaleDateString("ru-RU", {
      timeZone: "Europe/Moscow",
    }),
    createdAt: new Date(attempt.started_at).toLocaleTimeString("ru-RU", {
      timeZone: "Europe/Moscow",
    }),
    channel: "112",
    origin: "student",
    categoryName: attempt.classifier_entry?.name,
    fields: {
      ...emptyCardFields,
      categoryId: attempt.card.classifier_entry_id ?? "",
      address: {
        ...emptyIncidentAddress,
        ...address,
        ...(!Object.values(address).some(Boolean)
          ? { description: data.address_text ?? "" }
          : {}),
      },
      phones: {
        ...emptyIncidentPhones,
        ...phones,
        provided: phones.provided ?? data.caller_phone ?? "",
      },
      callerName: data.caller_name ?? "",
      description: data.description ?? "",
      operatorAction:
        typeof extra.operatorAction === "string" ? extra.operatorAction : "",
      victimsCount:
        typeof data.features?.victimsCount === "number"
          ? data.features.victimsCount
          : null,
      details,
      services: (attempt.status === "completed"
        ? attempt.notified_services
        : attempt.recipient_services
      ).map((s) => s.service_id),
      status: attempt.status === "completed" ? "notified" : "not_notified",
    },
  };
}
export function cardData(
  fields: IncidentCardFields,
  previous: CardData,
): CardData {
  return {
    ...previous,
    caller_name: fields.callerName,
    caller_phone: fields.phones.provided || fields.phones.callerId,
    caller_details: { ...previous.caller_details, ...fields.phones },
    address_text: formatAddress(fields.address),
    address_details: { ...previous.address_details, ...fields.address },
    description: fields.description,
    features: { ...previous.features, victimsCount: fields.victimsCount },
    additional_fields: {
      ...previous.additional_fields,
      details: fields.details ?? {},
      operatorAction: fields.operatorAction,
    },
  };
}
export function journalCard(card: JournalCard): IncidentCard {
  return {
    id: card.id,
    displayNumber: card.id.slice(0, 8),
    categoryName: card.category_name ?? "Без категории",
    createdDate: new Date(card.started_at).toLocaleDateString("ru-RU", {
      timeZone: "Europe/Moscow",
    }),
    createdAt: new Date(card.started_at).toLocaleTimeString("ru-RU", {
      timeZone: "Europe/Moscow",
    }),
    channel: "112",
    origin: "student",
    fields: {
      ...emptyCardFields,
      address: {
        ...emptyIncidentAddress,
        description: card.address_text ?? "",
      },
      phones: { ...emptyIncidentPhones, provided: card.caller_phone ?? "" },
      callerName: card.caller_name ?? "",
      description: card.description ?? "",
      categoryId: card.classifier_entry_id ?? "",
      status: card.status === "notified" ? "notified" : "not_notified",
    },
  };
}
