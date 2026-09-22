export interface NewIncidentDraft {
  categoryId: string;
  street: string;
  house: string;
  description: string;
}

export interface CreateIncidentDialogProps {
  open: boolean;
  disabled?: boolean;
  onClose: () => void;
  onCreate: (draft: NewIncidentDraft) => void;
}
