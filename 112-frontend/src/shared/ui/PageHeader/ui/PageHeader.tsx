import { Box, Typography } from "@mui/material";
import type { PageHeaderProps } from "../types/PageHeaderTypes";

export const PageHeader = ({
  title,
  description,
  actions,
}: PageHeaderProps) => {
  return (
    <Box component="header" className="page-header">
      <Box className="page-header__content">
        <Typography component="h1" variant="h4">
          {title}
        </Typography>

        {description && <Typography variant="body2">{description}</Typography>}
      </Box>

      {actions && <Box className="page-header__actions">{actions}</Box>}
    </Box>
  );
};
