import { emptyIncidentAddress, formatAddress } from "@/entities/incident-card";
import { LocationPicker } from "@/features/location-picker";
import { ArmIconButton } from "@/shared/ui/arm";
import { Dialog, DialogContent, DialogTitle } from "@mui/material";
import type { IncidentCardAuxiliaryDialogProps } from "../types/IncidentCardDialog";
import { CardTranslationPanel } from "./CardTranslationPanel";

const modalTitle = (modal: IncidentCardAuxiliaryDialogProps["modal"]) =>
  modal === "map"
    ? "Карта происшествия"
    : modal === "calls"
      ? "Записи звонков"
      : modal === "timing"
        ? "Время заполнения карточки"
        : modal === "translate"
          ? "Перевод сообщения"
          : "Список SMS";

export function IncidentCardAuxiliaryDialog({
  props,
  editor,
  locked,
  modal,
  setModal,
}: IncidentCardAuxiliaryDialogProps) {
  const { fields } = editor;
  return (
    <Dialog
      open={Boolean(modal)}
      onClose={() => setModal()}
      fullWidth
      maxWidth={modal === "map" ? "md" : "sm"}
      aria-labelledby={`${props.titleId}-aux`}
      className="arm-aux-dialog"
    >
      <DialogTitle id={`${props.titleId}-aux`}>
        {modalTitle(modal)}
        <ArmIconButton
          icon="close"
          label="Закрыть окно"
          onClick={() => setModal()}
        />
      </DialogTitle>
      <DialogContent>
        {modal === "map" &&
          (props.renderMap?.(formatAddress(fields.address)) ?? (
            <LocationPicker
              initial={fields.location ?? null}
              initialAddress={formatAddress(fields.address)}
              readOnly={locked("address")}
              onConfirm={({ point, address }) => {
                editor.setField("location", point);
                if (address)
                  editor.setField("address", {
                    ...emptyIncidentAddress,
                    country: address.country || "Россия",
                    region: address.administrativeAreas[0] ?? "",
                    locality: address.localities.at(-1) ?? "",
                    district: address.district,
                    area: address.area,
                    street: address.street,
                    house: address.house,
                    building: address.building,
                    structure: address.structure,
                    apartment: address.apartment,
                    description: address.addressLine,
                  });
                setModal();
              }}
              onCancel={() => setModal()}
            />
          ))}
        {modal === "calls" && (
          <p>
            SIP-звонки и аудиозапись пока не подключены. Условие задания
            передаётся текстом.
          </p>
        )}
        {modal === "timing" && (
          <p>
            Прошло: {props.elapsedSeconds} с. Учебный ориентир:{" "}
            {props.normSeconds} с.
          </p>
        )}
        {modal === "translate" && (
          <CardTranslationPanel
            initialText={fields.description || props.remote.message || ""}
            onClose={() => setModal()}
            onApply={(translation) => {
              editor.setField("description", translation);
              editor.setDetail("foreignLanguage", true);
              setModal();
            }}
          />
        )}
        {modal === "sms" && <p>В этом учебном задании SMS отсутствуют.</p>}
      </DialogContent>
    </Dialog>
  );
}
