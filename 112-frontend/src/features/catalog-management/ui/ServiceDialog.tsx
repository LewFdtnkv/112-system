import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
} from "@mui/material";
import { useState } from "react";
import type { ServiceDialogProps } from "../types/ServiceDialog";
import { ProfilesPanel } from "./ProfilesPanel";
import { ServiceForm } from "./ServiceForm";
import "../styles/service-dialog.scss";

export function ServiceDialog({
  service: initial,
  onClose,
  onSaved,
}: ServiceDialogProps) {
  const [service, setService] = useState(initial);
  const [editing, setEditing] = useState(!initial);
  return (
    <Dialog
      open
      fullWidth
      maxWidth="lg"
      onClose={onClose}
      aria-labelledby="service-dialog-title"
    >
      <DialogTitle id="service-dialog-title">
        {service ? "Карточка службы" : "Новая служба"}
      </DialogTitle>
      <DialogContent className="service-dialog">
        <Stack spacing={3}>
          {editing ? (
            <ServiceForm
              service={service}
              onCancel={() => (service ? setEditing(false) : onClose())}
              onSaved={(saved) => {
                setService(saved);
                setEditing(false);
                onSaved();
              }}
            />
          ) : (
            service && (
              <>
                <dl className="service-dialog__fields">
                  <div>
                    <dt>Код службы</dt>
                    <dd data-selectable>{service.code}</dd>
                  </div>
                  <div>
                    <dt>Короткое название</dt>
                    <dd data-selectable>{service.short_name || "—"}</dd>
                  </div>
                  <div>
                    <dt>Полное наименование</dt>
                    <dd data-selectable>{service.name}</dd>
                  </div>
                </dl>
                <div className="service-dialog__actions">
                  <Button onClick={() => setEditing(true)}>
                    Редактировать службу
                  </Button>
                </div>
              </>
            )
          )}
          {service && (
            <>
              <Divider />
              <ProfilesPanel key={service.id} service={service} />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
}
