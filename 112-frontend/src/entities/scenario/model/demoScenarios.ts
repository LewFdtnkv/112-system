import type { DemoScenario } from "./types";

export const demoScenarios: DemoScenario[] = [
  {
    id: "demo-scenario-1",
    name: "Задымление в подъезде",
    category: "Пожарная безопасность",
    difficulty: "basic",
    durationMinutes: 15,
    normSeconds: 30,
    description:
      "Учебное обращение: заявитель сообщает о запахе дыма в подъезде жилого дома.",
    status: "ready",
  },
  {
    id: "demo-scenario-2",
    name: "ДТП на перекрёстке",
    category: "Дорожное происшествие",
    difficulty: "advanced",
    durationMinutes: 20,
    normSeconds: 30,
    description:
      "Учебное обращение: заявитель сообщает о столкновении двух автомобилей на перекрёстке.",
    status: "ready",
  },
  {
    id: "demo-scenario-3",
    name: "Отключение водоснабжения",
    category: "Коммунальная авария",
    difficulty: "basic",
    durationMinutes: 10,
    normSeconds: 30,
    description: "Учебное обращение: в жилом доме отсутствует холодная вода.",
    status: "ready",
  },
  {
    id: "demo-scenario-4",
    name: "Неисправность уличного освещения",
    category: "Коммунальная авария",
    difficulty: "basic",
    durationMinutes: 10,
    normSeconds: 30,
    description: "Учебное обращение о неработающем освещении на улице.",
    status: "draft",
  },
];
