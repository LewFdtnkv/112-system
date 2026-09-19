import LogoutIcon from "@mui/icons-material/Logout";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import { Button } from "@mui/material";
import { NavLink, useNavigate } from "react-router-dom";

import { authApi, demoUsers, useAuthStore } from "@/entities/user";
import { routePaths } from "@/shared/config/routes";

export const AppHeader = () => {
  const session = useAuthStore((state) => state.session);
  const clearSession = useAuthStore((state) => state.clearSession);
  const navigate = useNavigate();
  const user = demoUsers.find((candidate) => candidate.id === session?.userId);

  return (
    <header className="app-header">
      <NavLink className="app-header__brand" to={routePaths.home} end>
        <SupportAgentIcon aria-hidden="true" />
        <span>112</span>
        <small>Учебный тренажёр ДДС</small>
      </NavLink>
      <span className="app-header__environment">
        Учебный контур · локальная среда
      </span>
      <nav className="app-header__utility" aria-label="Основная навигация">
        <NavLink to={routePaths.home} end>
          Главная
        </NavLink>
        <div>
          {user ? (
            <>
              <span className="app-header__user">{user.name}</span>
              <Button
                className="app-header__logout"
                type="button"
                startIcon={<LogoutIcon />}
                onClick={async () => {
                  await authApi.logout().catch(() => undefined);
                  clearSession();
                  navigate(routePaths.login);
                }}
              >
                Выйти
              </Button>
            </>
          ) : (
            <NavLink to={routePaths.login}>Вход</NavLink>
          )}
        </div>
      </nav>
    </header>
  );
};
