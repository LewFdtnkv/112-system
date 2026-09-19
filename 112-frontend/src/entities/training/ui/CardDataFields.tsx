import type { CardData } from "../model/types";

const fieldLabels: Record<string, string> = {
  caller_name: "Заявитель",
  caller_phone: "Телефон",
  caller_details: "Телефоны",
  callerId: "АОН",
  provided: "Предоставленный",
  onSite: "На месте",
  address_text: "Адрес",
  address_details: "Сведения об адресе",
  description: "Сообщение",
  victim_details: "Пострадавшие",
  features: "Признаки",
  victimsCount: "Количество пострадавших",
  additional_fields: "Дополнительные сведения",
  details: "Уточнения",
  operatorAction: "Комментарий оператора",
  country: "Страна",
  region: "Субъект",
  locality: "Населённый пункт",
  object: "Объект",
  district: "Округ",
  area: "Район",
  street: "Улица",
  house: "Дом",
  building: "Корпус",
  structure: "Строение",
  apartment: "Квартира",
  entrance: "Подъезд",
  floor: "Этаж",
  doorCode: "Код",
  classificationDescription: "Уточнение типа",
  callerStatus: "Статус заявителя",
  callerGender: "Пол",
  callerAge: "Возраст",
  foreignLanguage: "Иностранный язык",
  refusedAmbulance: "Отказ от скорой",
  blocked: "Заблокированные",
  clarifications: "Уточняющие признаки",
  has_victims: "Есть пострадавшие",
};
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
