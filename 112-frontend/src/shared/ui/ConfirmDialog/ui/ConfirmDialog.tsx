import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import { useId } from "react";
import type { ConfirmDialogProps } from "./types/ConfirmDialog";

export const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel = "Подтвердить",
  confirmColor,
  error,
  isPending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <Dialog
      open={open}
      onClose={isPending ? undefined : onCancel}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>
      {(description || error) && (
        <DialogContent>
          {description && (
            <DialogContentText id={descriptionId}>
              {description}
            </DialogContentText>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
      )}
      <DialogActions>
        <Button type="button" onClick={onCancel} disabled={isPending} autoFocus>
          Отмена
        </Button>
        <Button
          color={confirmColor}
          type="button"
          onClick={onConfirm}
          disabled={isPending}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export type { ConfirmDialogProps } from "./types/ConfirmDialog";
