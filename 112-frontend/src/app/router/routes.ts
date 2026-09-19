import type { RouteObject } from "react-router-dom";

import { ForbiddenPage } from "@/pages/forbidden";
import { HomePage } from "@/pages/home";
import { ChangePasswordPage } from "@/pages/change-password";
import { LoginPage } from "@/pages/login";
import { NotFoundPage } from "@/pages/not-found";
import { ServerErrorPage } from "@/pages/server-error";
import { routePaths } from "@/shared/config/routes";
import { LoadingScreen } from "@/shared/ui/LoadingScreen";

import { AuthLayout } from "../layouts/AuthLayout";
import { MainLayout } from "../layouts/MainLayout";
import {
  AdminRoute,
  AuthenticatedRoute,
  StaffRoute,
  StudentRoute,
} from "./guards/routeRoles";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

const studentRoutes: RouteObject = {
  Component: StudentRoute,
  children: [
    {
      path: routePaths.studentDashboard,
      lazy: async () => ({
        Component: (await import("@/pages/student-dashboard"))
          .StudentDashboardPage,
      }),
    },
    {
      path: routePaths.studentTrainingWorkspace,
      lazy: async () => ({
        Component: (await import("@/pages/training-workspace"))
          .TrainingWorkspacePage,
      }),
    },
  ],
};

const staffRoutes: RouteObject = {
  Component: StaffRoute,
  children: [
    {
      path: routePaths.groups,
      lazy: async () => ({
        Component: (await import("@/pages/groups")).GroupsPage,
      }),
    },
    {
      path: routePaths.cards,
      lazy: async () => ({
        Component: (await import("@/pages/cards")).CardsPage,
      }),
    },
    {
      path: routePaths.teacherDashboard,
      lazy: async () => ({
        Component: (await import("@/pages/teacher-dashboard"))
          .TeacherDashboardPage,
      }),
    },
    {
      path: routePaths.scenarios,
      lazy: async () => ({
        Component: (await import("@/pages/scenarios")).ScenariosPage,
      }),
    },
    {
      path: routePaths.scenarioCreate,
      lazy: async () => ({
        Component: (await import("@/pages/scenario-editor")).ScenarioEditorPage,
      }),
    },
    {
      path: routePaths.scenarioEditor,
      lazy: async () => ({
        Component: (await import("@/pages/scenario-editor")).ScenarioEditorPage,
      }),
    },
    {
      path: routePaths.training,
      lazy: async () => ({
        Component: (await import("@/pages/training-session"))
          .TrainingSessionPage,
      }),
    },
    {
      path: routePaths.trainingSession,
      lazy: async () => ({
        Component: (await import("@/pages/training-session"))
          .TrainingSessionPage,
      }),
    },
    {
      path: routePaths.sessionMonitoring,
      lazy: async () => ({
        Component: (await import("@/pages/session-monitoring"))
          .SessionMonitoringPage,
      }),
    },
    {
      path: routePaths.analytics,
      lazy: async () => ({
        Component: (await import("@/pages/analytics")).AnalyticsPage,
      }),
    },
  ],
};

const adminRoutes: RouteObject = {
  Component: AdminRoute,
  children: [
    {
      path: routePaths.catalogs,
      lazy: async () => ({
        Component: (await import("@/pages/catalogs")).CatalogsPage,
      }),
    },
    {
      path: routePaths.adminDashboard,
      lazy: async () => ({
        Component: (await import("@/pages/admin-dashboard")).AdminDashboardPage,
      }),
    },
    {
      path: routePaths.users,
      lazy: async () => ({
        Component: (await import("@/pages/users")).UsersPage,
      }),
    },
  ],
};

const resultRoutes: RouteObject = {
  Component: AuthenticatedRoute,
  children: [
    {
      path: routePaths.results,
      lazy: async () => ({
        Component: (await import("@/pages/training-result")).TrainingResultPage,
      }),
    },
    {
      path: routePaths.trainingResult,
      lazy: async () => ({
        Component: (await import("@/pages/training-result")).TrainingResultPage,
      }),
    },
  ],
};

export const routes: RouteObject[] = [
  {
    Component: MainLayout,
    ErrorBoundary: RouteErrorBoundary,
    HydrateFallback: LoadingScreen,
    children: [
      { path: routePaths.home, Component: HomePage },
      studentRoutes,
      staffRoutes,
      adminRoutes,
      resultRoutes,
      { path: routePaths.forbidden, Component: ForbiddenPage },
      { path: routePaths.notFound, Component: NotFoundPage },
      { path: routePaths.serverError, Component: ServerErrorPage },
      { path: "*", Component: NotFoundPage },
    ],
  },
  {
    Component: AuthLayout,
    ErrorBoundary: RouteErrorBoundary,
    children: [
      { path: routePaths.login, Component: LoginPage },
      { path: routePaths.changePassword, Component: ChangePasswordPage },
    ],
  },
];
