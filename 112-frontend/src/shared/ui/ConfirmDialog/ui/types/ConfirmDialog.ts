export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmColor?: "primary" | "error";
  error?: string;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
