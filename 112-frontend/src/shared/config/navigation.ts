import { routePaths } from "./routes";

export const navigationGroups = [
  {
    title: "Кабинеты",
    items: [
      {
        label: "Кабинет ученика",
        to: routePaths.studentDashboard,
        roles: ["student"],
      },
      {
        label: "Кабинет преподавателя",
        to: routePaths.teacherDashboard,
        roles: ["teacher"],
      },
      {
        label: "Кабинет администратора",
        to: routePaths.adminDashboard,
        roles: ["admin"],
      },
    ],
  },
  {
    title: "Учебный процесс",
    items: [
      {
        label: "Сценарии",
        to: routePaths.scenarios,
        roles: ["teacher"],
      },
      {
        label: "Учебные занятия",
        to: routePaths.training,
        roles: ["teacher"],
      },
      {
        label: "Мониторинг занятий",
        to: routePaths.sessionMonitoring,
        roles: ["teacher"],
      },
      {
        label: "Результаты",
        to: routePaths.results,
        roles: ["student", "teacher"],
      },
    ],
  },
  {
    title: "Управление",
    items: [
      { label: "Пользователи", to: routePaths.users, roles: ["admin"] },
      {
        label: "Аналитика",
        to: routePaths.analytics,
        roles: ["teacher"],
      },
    ],
  },
] as const;
