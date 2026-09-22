import type {
  IncidentAddress,
  IncidentCardFields,
  IncidentCategory,
  IncidentPhones,
  IncidentStatus,
  ResponseService,
} from "../types/types";

export const incidentStatusLabels: Record<IncidentStatus, string> = {
  in_progress: "Не завершено",
  not_notified: "Не оповещено",
  notified: "Оповещено",
  closed: "Завершено",
};

export const incidentStatuses: readonly IncidentStatus[] = [
  "in_progress",
  "not_notified",
  "closed",
];

export const responseServices: readonly ResponseService[] = [
  "101",
  "102",
  "103",
  "104",
];

export const incidentCategories: readonly IncidentCategory[] = [
  { id: "traffic", name: "ДТП", defaultServices: ["102", "103"] },
  { id: "fire", name: "Пожар", defaultServices: ["101"] },
  { id: "utility", name: "Коммунальная авария", defaultServices: ["104"] },
  { id: "medical", name: "Медицинский вызов", defaultServices: ["103"] },
  { id: "other", name: "Иное обращение", defaultServices: [] },
  { id: "wrong_number", name: "Ошибочно набран номер", defaultServices: [] },
  { id: "gas", name: "104", defaultServices: ["104"] },
  { id: "person_danger", name: "Человек в опасности", defaultServices: [] },
  { id: "cancelled", name: "Отмена вызова", defaultServices: [] },
  { id: "test_call", name: "Тестовый вызов", defaultServices: [] },
  { id: "shift", name: "Передача дежурства", defaultServices: [] },
  { id: "consultation", name: "Консультация", defaultServices: [] },
  { id: "foreign", name: "Вызов на иностранном языке", defaultServices: [] },
  { id: "reference101", name: "Справка-101", defaultServices: [] },
];

export const getCategoryName = (categoryId: string) =>
  incidentCategories.find((category) => category.id === categoryId)?.name ??
  "Без категории";

export const emptyIncidentAddress: IncidentAddress = {
  district: "",
  area: "",
  street: "",
  house: "",
  building: "",
  apartment: "",
  entrance: "",
  floor: "",
  description: "",
};

export const formatAddress = (address: IncidentAddress) => {
  const parts = [
    address.locality,
    address.street,
    address.house && `д. ${address.house}`,
    address.building && `корп. ${address.building}`,
    address.structure && `стр. ${address.structure}`,
    address.apartment && `кв./оф. ${address.apartment}`,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : address.description;
};

export const emptyIncidentPhones: IncidentPhones = {
  callerId: "",
  provided: "",
  onSite: "",
};

export const emptyCardFields: IncidentCardFields = {
  categoryId: "",
  address: emptyIncidentAddress,
  callerName: "",
  phones: emptyIncidentPhones,
  victimsCount: null,
  description: "",
  operatorAction: "",
  services: [],
  status: "in_progress",
};

export const countFilledFields = (fields: IncidentCardFields) =>
  Object.entries(fields).filter(([key, value]) => {
    if (key === "details") return false;
    if (key === "address") {
      return Object.values(value as IncidentAddress).some(
        (part) => typeof part === "string" && part.trim().length > 0,
      );
    }
    if (key === "phones") {
      return Object.values(value as IncidentPhones).some(
        (part) => typeof part === "string" && part.trim().length > 0,
      );
    }
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim().length > 0;
    return value !== null;
  }).length;

export const totalCardFields = Object.keys(emptyCardFields).length;

export type {
  IncidentAddress,
  IncidentCard,
  IncidentCardDetails,
  IncidentCardFields,
  IncidentCategory,
  IncidentPhones,
  IncidentStatus,
  ResponseService,
} from "../types/types";
