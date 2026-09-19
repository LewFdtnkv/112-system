import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";
import { useState } from "react";

import { incidentCategories } from "@/entities/incident-card";

export interface NewIncidentDraft {
  categoryId: string;
  street: string;
  house: string;
  description: string;
}

interface CreateIncidentDialogProps {
  open: boolean;
  disabled?: boolean;
  onClose: () => void;
  onCreate: (draft: NewIncidentDraft) => void;
}

const initialDraft: NewIncidentDraft = {
  categoryId: "other",
  street: "",
  house: "",
  description: "",
};

export const CreateIncidentDialog = ({
  open,
  disabled = false,
  onClose,
  onCreate,
}: CreateIncidentDialogProps) => {
  const [draft, setDraft] = useState<NewIncidentDraft>(initialDraft);

  const setField = (key: keyof NewIncidentDraft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Новая учебная карточка</DialogTitle>
      <DialogContent>
        <div className="incident-card-form">
          <TextField
            disabled={disabled}
            select
            label="Тип происшествия"
            value={draft.categoryId}
            onChange={(event) => setField("categoryId", event.target.value)}
          >
            {incidentCategories.map((category) => (
              <MenuItem key={category.id} value={category.id}>
                {category.name}
              </MenuItem>
            ))}
          </TextField>
          <div className="arm-card-panel__fields">
            <TextField
              disabled={disabled}
              label="Улица"
              value={draft.street}
              onChange={(event) => setField("street", event.target.value)}
            />
            <TextField
              disabled={disabled}
              label="Дом"
              value={draft.house}
              onChange={(event) => setField("house", event.target.value)}
            />
          </div>
          <TextField
            disabled={disabled}
            label="Сообщение заявителя"
            value={draft.description}
            multiline
            minRows={3}
            onChange={(event) => setField("description", event.target.value)}
          />
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="contained"
          disabled={disabled}
          onClick={() => {
            onCreate(draft);
            setDraft(initialDraft);
          }}
        >
          Создать
        </Button>
      </DialogActions>
    </Dialog>
  );
};
