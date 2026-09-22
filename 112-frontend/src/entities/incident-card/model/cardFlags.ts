/** Fixed ARM controls; independent of the selected EKP questionnaire. */
export const cardFlagFields = [
  { key: "hasVictims", parameter: "has_victims", label: "Пострадавшие" },
  {
    key: "refusedAmbulance",
    parameter: "refused_ambulance",
    label: "Нет на месте / Отказ от скорой",
  },
  {
    key: "blocked",
    parameter: "blocked",
    label: "Нет доступа / Заблокированные",
  },
  { key: "noContact", parameter: "no_contact", label: "Нет контакта" },
  { key: "callDropped", parameter: "call_dropped", label: "Срыв звонка" },
] as const;
