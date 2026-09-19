import { useId } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog = ({
  open,
  title,
  description,
  confirmLabel = "Подтвердить",
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
      {description && (
        <DialogContent>
          <DialogContentText id={descriptionId}>
            {description}
          </DialogContentText>
        </DialogContent>
      )}
      <DialogActions>
        <Button type="button" onClick={onCancel} disabled={isPending} autoFocus>
          Отмена
        </Button>
        <Button type="button" onClick={onConfirm} disabled={isPending}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
