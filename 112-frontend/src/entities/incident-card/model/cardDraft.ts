import {
  emptyCardFields,
  incidentStatuses,
  responseServices,
  type IncidentAddress,
  type IncidentCardFields,
  type IncidentPhones,
  type IncidentStatus,
  type ResponseService,
} from "./types";

export interface CardDraft {
  cardId: string;
  fields: IncidentCardFields;
  savedAt: string;
}

const draftVersion = 1;

export const cardDraftStorageKey = (sessionId: string, cardId?: string) =>
  `dds112-card-draft:v${draftVersion}:${sessionId}${cardId ? `:${cardId}` : ""}`;

const asString = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : fallback;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asAddress = (source: Record<string, unknown>): IncidentAddress => {
  const address = isRecord(source.address) ? source.address : {};

  return {
    ...Object.fromEntries(
      ["country", "region", "locality", "object", "structure", "doorCode"]
        .filter((key) => typeof address[key] === "string")
        .map((key) => [key, address[key]]),
    ),
    district: asString(address.district, asString(source.district, "")),
    area: asString(address.area, ""),
    street: asString(address.street, ""),
    house: asString(address.house, ""),
    building: asString(address.building, ""),
    apartment: asString(address.apartment, ""),
    entrance: asString(address.entrance, ""),
    floor: asString(address.floor, ""),
    // Старый адрес сохраняем целиком: надёжно разделить его на части нельзя.
    description: asString(address.description, asString(source.address, "")),
  };
};

const asPhones = (source: Record<string, unknown>): IncidentPhones => {
  const phones = isRecord(source.phones) ? source.phones : {};

  return {
    callerId: asString(phones.callerId, ""),
    provided: asString(phones.provided, asString(source.callerPhone, "")),
    onSite: asString(phones.onSite, ""),
  };
};

const asServices = (value: unknown): readonly ResponseService[] =>
  Array.isArray(value)
    ? value.filter((item): item is ResponseService =>
        responseServices.includes(item as ResponseService),
      )
    : [];

const asStatus = (value: unknown): IncidentStatus =>
  incidentStatuses.includes(value as IncidentStatus)
    ? (value as IncidentStatus)
    : "in_progress";

const asFields = (source: Record<string, unknown>): IncidentCardFields => {
  return {
    ...(isRecord(source.details)
      ? {
          details: {
            buildingFloors: asString(source.details.buildingFloors, ""),
            classificationDescription: asString(
              source.details.classificationDescription,
              "",
            ),
            callerStatus: asString(source.details.callerStatus, ""),
            callerGender: asString(source.details.callerGender, ""),
            callerAge: asString(source.details.callerAge, ""),
            foreignLanguage: source.details.foreignLanguage === true,
            refusedAmbulance: source.details.refusedAmbulance === true,
            blocked: source.details.blocked === true,
            clarifications: isRecord(source.details.clarifications)
              ? Object.fromEntries(
                  Object.entries(source.details.clarifications).filter(
                    (entry): entry is [string, string[]] =>
                      Array.isArray(entry[1]) &&
                      entry[1].every((value) => typeof value === "string"),
                  ),
                )
              : {},
          },
        }
      : {}),
    categoryId: asString(source.categoryId, emptyCardFields.categoryId),
    address: asAddress(source),
    callerName: asString(source.callerName, emptyCardFields.callerName),
    phones: asPhones(source),
    victimsCount:
      typeof source.victimsCount === "number" &&
      Number.isInteger(source.victimsCount) &&
      source.victimsCount >= 0
        ? source.victimsCount
        : null,
    description: asString(source.description, emptyCardFields.description),
    operatorAction: asString(
      source.operatorAction,
      emptyCardFields.operatorAction,
    ),
    services: asServices(source.services),
    status: asStatus(source.status),
  };
};

export const readCardDraft = (
  sessionId: string | undefined,
  cardId: string,
): IncidentCardFields | null => {
  if (!sessionId) return null;

  try {
    const raw =
      localStorage.getItem(cardDraftStorageKey(sessionId, cardId)) ??
      localStorage.getItem(cardDraftStorageKey(sessionId));
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) &&
      parsed.cardId === cardId &&
      isRecord(parsed.fields)
      ? asFields(parsed.fields)
      : null;
  } catch {
    return null;
  }
};

export const writeCardDraft = (
  sessionId: string | undefined,
  cardId: string,
  fields: IncidentCardFields,
) => {
  if (!sessionId) return;

  const draft: CardDraft = {
    cardId,
    fields,
    savedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(
      cardDraftStorageKey(sessionId, cardId),
      JSON.stringify(draft),
    );
  } catch {
    // Квота или запрет хранилища не должны ломать занятие.
  }
};

export const clearCardDraft = (
  sessionId: string | undefined,
  cardId: string,
) => {
  if (!sessionId) return;

  try {
    localStorage.removeItem(cardDraftStorageKey(sessionId, cardId));
    const legacyKey = cardDraftStorageKey(sessionId);
    const legacyDraft = localStorage.getItem(legacyKey);
    if (legacyDraft && JSON.parse(legacyDraft)?.cardId === cardId) {
      localStorage.removeItem(legacyKey);
    }
  } catch {
    // Игнорируем: черновик — вспомогательные данные.
  }
};
