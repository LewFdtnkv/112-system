import ReplayIcon from "@mui/icons-material/Replay";
import { Button, Typography } from "@mui/material";
import type { ErrorStateProps } from "./types/ErrorState";

export const ErrorState = ({
  title = "Не удалось загрузить данные",
  description,
  onRetry,
}: ErrorStateProps) => {
  return (
    <div className="error-state">
      <div role="alert">
        <Typography component="h2" variant="h6">
          {title}
        </Typography>
        {description && <Typography>{description}</Typography>}
      </div>
      {onRetry && (
        <Button type="button" startIcon={<ReplayIcon />} onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
};

export type { ErrorStateProps } from "./types/ErrorState";
