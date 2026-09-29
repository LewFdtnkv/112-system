import {
  emptyCardFields,
  emptyIncidentAddress,
  emptyIncidentPhones,
  formatAddress,
  type IncidentCard,
  type IncidentCardFields,
} from "@/entities/incident-card";
import type { Attempt, CardData, JournalCard } from "@/entities/training";
import type { FeatureValue } from "@/shared/lib/featureValues";
import type { ReferenceCardSource } from "../types/cardAdapter";
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const strings = (value: unknown) =>
  Object.fromEntries(
    Object.entries(record(value)).filter(([, v]) => typeof v === "string"),
  ) as Record<string, string>;
function answerFields(data: CardData): IncidentCardFields {
  const extra = record(data.additional_fields);
  const phones = strings(data.caller_details);
  const address = strings(data.address_details);
  return {
    ...emptyCardFields,
    location: (extra.location as IncidentCardFields["location"]) ?? null,
    ekpAnswers:
      (data.features?.ekp as Record<string, FeatureValue> | undefined) ?? {},
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
    details: record(extra.details),
  };
}
export function attemptCard(attempt: Attempt): IncidentCard {
  const services =
    attempt.status === "completed"
      ? attempt.notified_services
      : attempt.recipient_services;
  return {
    id: attempt.card.id,
    displayNumber: attempt.card.display_number,
    createdDate: new Date(attempt.started_at).toLocaleDateString("ru-RU", {
      timeZone: "Europe/Moscow",
    }),
    createdAt: new Date(attempt.started_at).toLocaleTimeString("ru-RU", {
      timeZone: "Europe/Moscow",
    }),
    channel: "112",
    origin: "student",
    categoryName:
      attempt.classifier_entry?.display_name || attempt.classifier_entry?.name,
    fields: {
      ...answerFields(attempt.card.data),
      ...(attempt.exercise_scope?.includes("address") &&
      !attempt.card.data.address_text &&
      !Object.values(attempt.card.data.address_details ?? {}).some(Boolean)
        ? {
            address: { ...emptyIncidentAddress, country: "", region: "" },
          }
        : {}),
      manualServices:
        attempt.card.recipient_service_ids != null
          ? services.map((s) => ({
              id: s.service_id,
              name: s.name,
              short_name: s.short_name,
            }))
          : null,
      categoryId: attempt.card.classifier_entry_id ?? "",
      services: services.map((s) => s.service_id),
      status: attempt.status === "completed" ? "notified" : "not_notified",
    },
  };
}
export function referenceCard(source: ReferenceCardSource): IncidentCard {
  return {
    id: source.id,
    displayNumber: source.display_number,
    createdAt: "",
    channel: "112",
    origin: "generated",
    categoryName:
      source.classifier_entry?.display_name || source.classifier_entry?.name,
    fields: {
      ...answerFields(source.data),
      categoryId: source.classifier_entry?.id ?? "",
      services: (source.recipients ?? []).map((s) => s.service_id),
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
    features: {
      ...previous.features,
      victimsCount: fields.victimsCount,
      ekp: fields.ekpAnswers ?? {},
    },
    additional_fields: {
      ...previous.additional_fields,
      location: fields.location ?? null,
      details: fields.details ?? {},
      operatorAction: fields.operatorAction,
    },
  };
}
export function journalCard(card: JournalCard): IncidentCard {
  return {
    id: card.id,
    displayNumber: card.display_number,
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

export type { ReferenceCardSource } from "../types/cardAdapter";
