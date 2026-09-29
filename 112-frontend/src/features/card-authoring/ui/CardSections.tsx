import { useId, useLayoutEffect, useRef, type PropsWithChildren } from "react";
import { Button } from "@mui/material";
import { cardSections } from "../model/cardSections";
import type { CardRoleSectionProps } from "../types/CardSections";
import "../styles/card-sections.scss";

export function CardSections({ children }: PropsWithChildren) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    root.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
  }, []);
  return (
    <div ref={root} className="card-sections">
      <nav className="card-sections-nav" aria-label="Разделы карточки">
        {Object.entries(cardSections).map(([kind, section]) => (
          <Button
            key={kind}
            type="button"
            onClick={() => {
              const target = root.current?.querySelector<HTMLElement>(
                `[data-card-section="${kind}"]`,
              );
              target?.focus({ preventScroll: true });
              target?.scrollIntoView({ block: "start", behavior: "instant" });
            }}
          >
            {section.title}
          </Button>
        ))}
      </nav>
      {children}
    </div>
  );
}

export function CardRoleSection({ kind, children }: CardRoleSectionProps) {
  const id = useId();
  const section = cardSections[kind];
  return (
    <section
      className={`card-role-section card-role-section--${kind}`}
      data-card-section={kind}
      aria-labelledby={id}
      tabIndex={-1}
    >
      <header className="card-role-section-heading">
        <h3 id={id}>{section.title}</h3>
        <p>{section.description}</p>
      </header>
      <div className="card-role-section-content">{children}</div>
    </section>
  );
}
