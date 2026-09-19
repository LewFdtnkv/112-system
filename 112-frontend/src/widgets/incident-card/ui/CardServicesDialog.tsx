import { Dialog, DialogContent, DialogTitle } from "@mui/material";
import { useState } from "react";
import {
  responseServices,
  type ResponseService,
} from "@/entities/incident-card";
import { ArmField, ArmIconButton } from "@/shared/ui/arm";

const serviceNames: Record<ResponseService, string> = {
  "101": "Служба 101 (Пожарно-спасательная служба)",
  "102": "Служба 102 (Полиция)",
  "103": "Служба 103 (Скорая и неотложная медицинская помощь)",
  "104": "Служба 104 (Аварийная газовая служба)",
};
interface Props {
  open: boolean;
  selected: readonly ResponseService[];
  onToggle: (service: ResponseService) => void;
  onClose: () => void;
}
export function CardServicesDialog({
  open,
  selected,
  onToggle,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const visible = responseServices.filter((service) =>
    serviceNames[service]
      .toLocaleLowerCase("ru")
      .includes(query.toLocaleLowerCase("ru")),
  );
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      className="arm-services-dialog"
      aria-labelledby="services-dialog-title"
    >
      <DialogTitle id="services-dialog-title">
        Добавьте службы
        <ArmIconButton
          icon="close"
          label="Закрыть выбор служб"
          onClick={onClose}
        />
      </DialogTitle>
      <DialogContent>
        <ArmField
          label="Поиск службы"
          inline
          placeholder="Поиск ..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul>
          {visible.map((service) => (
            <li key={service}>
              <button
                aria-label={service}
                aria-pressed={selected.includes(service)}
                onClick={() => onToggle(service)}
              >
                {serviceNames[service]}
              </button>
            </li>
          ))}
          {!visible.length && (
            <li className="arm-services-empty">Служба не найдена.</li>
          )}
        </ul>
        <button className="arm-services-confirm" onClick={onClose}>
          Сохранить и закрыть
        </button>
      </DialogContent>
    </Dialog>
  );
}
