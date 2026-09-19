export type IncidentStatus = "in_progress" | "not_notified" | "closed";

export type ResponseService = "101" | "102" | "103" | "104";

export const incidentStatusLabels: Record<IncidentStatus, string> = {
  in_progress: "Не завершено",
  not_notified: "Не оповещено",
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

export interface IncidentCategory {
  id: string;
  name: string;
  defaultServices: readonly ResponseService[];
}

export const incidentCategories: readonly IncidentCategory[] = [
  { id: "traffic", name: "ДТП", defaultServices: ["102", "103"] },
  { id: "fire", name: "Пожар", defaultServices: ["101"] },
  { id: "utility", name: "Коммунальная авария", defaultServices: ["104"] },
  { id: "medical", name: "Медицинский вызов", defaultServices: ["103"] },
  { id: "other", name: "Иное обращение", defaultServices: [] },
];

export const getCategoryName = (categoryId: string) =>
  incidentCategories.find((category) => category.id === categoryId)?.name ??
  "Без категории";

export interface IncidentCardFields {
  categoryId: string;
  address: string;
  district: string;
  callerName: string;
  callerPhone: string;
  victimsCount: number | null;
  description: string;
  operatorAction: string;
  services: readonly ResponseService[];
  status: IncidentStatus;
}

export interface IncidentCard {
  id: string;
  createdAt: string;
  channel: string;
  origin: "generated" | "student";
  fields: IncidentCardFields;
}

export const emptyCardFields: IncidentCardFields = {
  categoryId: "",
  address: "",
  district: "",
  callerName: "",
  callerPhone: "",
  victimsCount: null,
  description: "",
  operatorAction: "",
  services: [],
  status: "in_progress",
};

export const requiredCardFields: readonly (keyof IncidentCardFields)[] = [
  "categoryId",
  "address",
  "description",
  "operatorAction",
];

export const getMissingCardFields = (fields: IncidentCardFields) => {
  const missing = requiredCardFields.filter((field) => {
    const value = fields[field];
    return typeof value === "string" ? value.trim().length === 0 : false;
  });

  return fields.services.length === 0
    ? [...missing, "services" as const]
    : missing;
};

export const incidentCardFieldLabels: Record<string, string> = {
  categoryId: "Тип происшествия",
  address: "Адрес",
  district: "Округ",
  callerName: "Заявитель",
  callerPhone: "Телефон заявителя",
  victimsCount: "Пострадавшие",
  description: "Сообщение",
  operatorAction: "Действие оператора",
  services: "Службы реагирования",
  status: "Статус обработки",
};

export const countFilledFields = (fields: IncidentCardFields) =>
  Object.values(fields).filter((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim().length > 0;
    return value !== null;
  }).length;

export const totalCardFields = Object.keys(emptyCardFields).length;
