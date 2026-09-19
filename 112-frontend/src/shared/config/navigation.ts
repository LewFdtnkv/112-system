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
        roles: ["teacher", "admin"],
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
        roles: ["teacher", "admin"],
      },
      {
        label: "Учебные занятия",
        to: routePaths.training,
        roles: ["teacher", "admin"],
      },
      {
        label: "Мониторинг занятий",
        to: routePaths.sessionMonitoring,
        roles: ["teacher", "admin"],
      },
      {
        label: "Результаты",
        to: routePaths.results,
        roles: ["student", "teacher", "admin"],
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
        roles: ["teacher", "admin"],
      },
    ],
  },
] as const;
