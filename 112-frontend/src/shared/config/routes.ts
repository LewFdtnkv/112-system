import { generatePath } from "react-router-dom";

export const routePaths = {
  home: "/",
  login: "/login",
  changePassword: "/change-password",
  studentDashboard: "/student",
  teacherDashboard: "/teacher",
  studentProfile: "/teacher/students/:studentId",
  adminDashboard: "/admin",
  scenarios: "/scenarios",
  scenarioCreate: "/scenarios/new",
  scenarioEditor: "/scenarios/:scenarioId/edit",
  training: "/training",
  trainingSession: "/training/:sessionId",
  studentTrainingWorkspace: "/student/sessions/:sessionId",
  results: "/results",
  trainingResult: "/results/:sessionId",
  sessionMonitoring: "/sessions",
  users: "/users",
  groups: "/groups",
  cards: "/cards",
  catalogs: "/catalogs",
  analytics: "/analytics",
  forbidden: "/403",
  notFound: "/404",
  serverError: "/500",
} as const;

export const getScenarioEditPath = (scenarioId: string) =>
  generatePath(routePaths.scenarioEditor, {
    scenarioId: encodeURIComponent(scenarioId),
  });

export const getTrainingSessionPath = (sessionId: string) =>
  generatePath(routePaths.trainingSession, {
    sessionId: encodeURIComponent(sessionId),
  });

export const getStudentTrainingWorkspacePath = (sessionId: string) =>
  generatePath(routePaths.studentTrainingWorkspace, {
    sessionId: encodeURIComponent(sessionId),
  });

export const getTrainingResultPath = (sessionId: string) =>
  generatePath(routePaths.trainingResult, {
    sessionId: encodeURIComponent(sessionId),
  });

export const getStudentProfilePath = (studentId: string) =>
  generatePath(routePaths.studentProfile, {
    studentId: encodeURIComponent(studentId),
  });
