import { StudentNotificationBell } from "@/features/teaching-messages";
import { UserIdentity } from "@/entities/training";
import LogoutIcon from "@mui/icons-material/Logout";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import { Button } from "@mui/material";
import { NavLink, useNavigate } from "react-router-dom";

import { signOut, useAuthStore } from "@/entities/user";
import { routePaths } from "@/shared/config/routes";

export const AppHeader = () => {
  const session = useAuthStore((state) => state.session);
  const navigate = useNavigate();

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
          {session ? (
            <>
              <span className="app-header__user">
                <UserIdentity
                  userId={session.userId}
                  name={session.name ?? session.username ?? "Пользователь"}
                />
              </span>
              {session.roles.includes("student") && <StudentNotificationBell />}
              <Button
                className="app-header__logout"
                type="button"
                startIcon={<LogoutIcon />}
                onClick={async () => {
                  await signOut().catch(() => undefined);
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
