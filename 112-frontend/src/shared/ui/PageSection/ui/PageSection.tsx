import type { PageSectionProps } from "../types/PageSection";
import { Typography } from "@mui/material";
import { useId } from "react";

export const PageSection = ({ title, children }: PageSectionProps) => {
  const titleId = useId();

  return (
    <section className="page-section" aria-labelledby={titleId}>
      <Typography
        className="page-section__title"
        component="h2"
        variant="h6"
        id={titleId}
      >
        {title}
      </Typography>
      {children}
    </section>
  );
};
