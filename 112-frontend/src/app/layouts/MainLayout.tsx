import { matchPath, Outlet, useLocation } from "react-router-dom";

import { routePaths } from "@/shared/config/routes";
import { AppHeader } from "@/widgets/app-header";
import { AppSidebar } from "@/widgets/app-sidebar";

export const MainLayout = () => {
  const location = useLocation();

  if (
    matchPath(
      { path: routePaths.studentTrainingWorkspace, end: true },
      location.pathname,
    )
  ) {
    return (
      <main className="arm-workspace">
        <Outlet />
      </main>
    );
  }

  return (
    <div className="app-shell">
      <AppHeader />
      <AppSidebar />
      <div className="app-workspace">
        <p className="app-demo-note" role="note">
          Учебный тренажёр · Автооценка и пересмотр · ДДС и SIP пока недоступны
        </p>
        <main className="app-main">
          <Outlet />
        </main>
        <footer className="app-footer">Тренажёр ДДС/112 · учебная среда</footer>
      </div>
    </div>
  );
};
