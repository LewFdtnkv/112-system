import { useId, type PropsWithChildren } from "react";
import { Typography } from "@mui/material";

export const PageSection = ({
  title,
  children,
}: PropsWithChildren<{ title: string }>) => {
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
