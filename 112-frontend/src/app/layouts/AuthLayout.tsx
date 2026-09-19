import { Link, Outlet } from "react-router-dom";

import { routePaths } from "@/shared/config/routes";

export const AuthLayout = () => {
  return (
    <div className="auth-shell">
      <header className="auth-header">
        <Link to={routePaths.home}>
          <strong>112</strong>
          <span>Учебный тренажёр ДДС</span>
        </Link>
      </header>
      <main className="auth-main">
        <Outlet />
      </main>
    </div>
  );
};
