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

export interface IncidentTagGroup {
  label: string;
  options: readonly string[];
}

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

// The reference ARM's shortcuts; this demonstration list is not an EKP import.
export const frequentIncidentCategoryIds = [
  "traffic",
  "wrong_number",
  "gas",
  "person_danger",
  "cancelled",
  "test_call",
  "shift",
  "consultation",
  "foreign",
  "reference101",
];

export const getCategoryName = (categoryId: string) =>
  incidentCategories.find((category) => category.id === categoryId)?.name ??
  "Без категории";

const incidentTagGroups: Record<string, readonly IncidentTagGroup[]> = {
  fire: [
    {
      label: "Где",
      options: [
        "Улица",
        "Транспорт",
        "Дом",
        "Здание / объект",
        "Опасный объект",
      ],
    },
    {
      label: "Признак пожара (дом)",
      options: [
        "Открытое пламя / Дым",
        "Запах гари",
        "Сработала пожарная сигнализация",
      ],
    },
    { label: "Доступ", options: ["Нет доступа"] },
    {
      label: "Дом (пламя, дым)",
      options: [
        "Дом многоквартирный",
        "Дом частный",
        "Дача",
        "Сарай / бытовка / хоз. постройка",
        "Выселенное здание",
      ],
    },
    { label: "Угроза людям", options: ["Да", "Нет"] },
    {
      label: "Внутридомовые объекты (пламя, дым)",
      options: [
        "Квартира",
        "Балкон",
        "Газовая колонка",
        "Газовая плита",
        "Лифт",
        "Мусоропровод",
        "Подъезд",
        "Счетчик электричества",
        "Электрическая проводка",
        "Электрощит",
        "Лестничная клетка",
        "Подвал",
        "Прочие внутридомовые объекты",
        "Крыша",
      ],
    },
    { label: "Есть ли перекрытие движения", options: ["Да", "Нет"] },
    { label: "Проведена ли газификация", options: ["Да", "Нет", "Нет данных"] },
  ],
  traffic: [
    {
      label: "Тип ДТП",
      options: [
        "Столкновение",
        "Наезд",
        "Опрокидывание",
        "Препятствие на дороге",
      ],
    },
    { label: "Пострадавшие", options: ["Есть", "Нет", "Неизвестно"] },
    { label: "Движение", options: ["Перекрыто", "Затруднено", "Свободно"] },
  ],
  utility: [
    { label: "Ресурс", options: ["Вода", "Тепло", "Электричество", "Газ"] },
    { label: "Масштаб", options: ["Квартира", "Дом", "Улица", "Район"] },
  ],
  medical: [
    {
      label: "Состояние",
      options: ["Травма", "Потеря сознания", "Боль", "Угроза жизни"],
    },
    { label: "Пациент", options: ["Ребёнок", "Взрослый", "Несколько человек"] },
  ],
  other: [
    {
      label: "Характер",
      options: ["Консультация", "Передача", "Тестовый вызов"],
    },
  ],
};

export const getIncidentTagGroups = (categoryId: string) =>
  incidentTagGroups[categoryId] ?? incidentTagGroups.other;

export interface IncidentAddress {
  country?: string;
  region?: string;
  locality?: string;
  object?: string;
  structure?: string;
  doorCode?: string;
  district: string;
  area: string;
  street: string;
  house: string;
  building: string;
  apartment: string;
  entrance: string;
  floor: string;
  description: string;
}

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
    address.street,
    address.house && `д. ${address.house}`,
    address.building && `корп. ${address.building}`,
    address.apartment && `кв./оф. ${address.apartment}`,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : address.description;
};

export interface IncidentPhones {
  callerId: string;
  provided: string;
  onSite: string;
}

export const emptyIncidentPhones: IncidentPhones = {
  callerId: "",
  provided: "",
  onSite: "",
};

export interface IncidentCardDetails {
  buildingFloors?: string;
  classificationDescription?: string;
  callerStatus?: string;
  callerGender?: string;
  callerAge?: string;
  foreignLanguage?: boolean;
  refusedAmbulance?: boolean;
  blocked?: boolean;
  clarifications?: Record<string, readonly string[]>;
}

export interface IncidentCardFields {
  details?: IncidentCardDetails;
  categoryId: string;
  address: IncidentAddress;
  callerName: string;
  phones: IncidentPhones;
  victimsCount: number | null;
  description: string;
  operatorAction: string;
  services: readonly ResponseService[];
  status: IncidentStatus;
}

export interface IncidentCard {
  createdDate?: string;
  operatorNumber?: string;
  workstation?: string;
  id: string;
  createdAt: string;
  channel: string;
  origin: "generated" | "student";
  fields: IncidentCardFields;
}

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

const requiredAddressFields: readonly (keyof IncidentAddress)[] = [
  "street",
  "house",
];

export const requiredCardFields: readonly (keyof IncidentCardFields)[] = [
  "categoryId",
  "address",
  "description",
  "operatorAction",
];

export const getMissingCardFields = (fields: IncidentCardFields) => {
  const missing = requiredCardFields.filter((field) => {
    const value = fields[field];
    if (field === "address") {
      return requiredAddressFields.some(
        (part) => (fields.address[part] ?? "").trim().length === 0,
      );
    }
    return typeof value === "string" ? value.trim().length === 0 : false;
  });

  return fields.services.length === 0
    ? [...missing, "services" as const]
    : missing;
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
