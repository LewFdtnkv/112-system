import { Box, Typography } from "@mui/material";
import type { EmptyStateProps } from "../types/EmptyStateTypes";

export const EmptyState = ({ title, description, action }: EmptyStateProps) => {
  return (
    <Box className="empty-state">
      <Typography variant="h6">{title}</Typography>

      {description && <Typography variant="body2">{description}</Typography>}

      {action}
    </Box>
  );
};
