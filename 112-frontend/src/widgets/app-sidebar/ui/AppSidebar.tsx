import { useRef, useState } from "react";
import { NavLink } from "react-router-dom";

import { useAuthStore } from "@/entities/user";
import { routePaths } from "@/shared/config/routes";
import { navigationGroups } from "@/shared/config/navigation";

export const AppSidebar = () => {
  const session = useAuthStore((state) => state.session);
  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        item.roles.some((role) => session?.roles.includes(role)),
      ),
    }))
    .filter((group) => group.items.length > 0);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [isOpen, setIsOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 760,
  );

  return (
    <aside className="app-sidebar">
      <details
        ref={detailsRef}
        open={isOpen}
        onToggle={(event) => setIsOpen(event.currentTarget.open)}
      >
        <summary>Разделы</summary>
        <nav aria-label="Разделы тренажёра">
          <p className="app-sidebar__caption">Рабочее место оператора</p>
          {visibleGroups.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h2>{group.title}</h2>
              <ul>
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={
                        item.to === routePaths.teacherDashboard ||
                        item.to === routePaths.studentDashboard ||
                        item.to === routePaths.adminDashboard
                      }
                      onClick={() => {
                        if (window.innerWidth <= 760 && detailsRef.current) {
                          setIsOpen(false);
                        }
                      }}
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      </details>
    </aside>
  );
};
