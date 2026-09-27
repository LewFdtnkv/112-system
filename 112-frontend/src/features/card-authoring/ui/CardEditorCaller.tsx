import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import { LocationPicker } from "@/shared/ui/location-picker";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import {
  Alert,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
} from "@mui/material";
import { useState } from "react";
import type { CardEditorPanelProps } from "../types/CardEditorPanels";
import { TemplateAddress } from "./TemplateAddress";
import { CardEditorTextFields } from "./CardEditorTextFields";

export function CardEditorCaller({
  editor,
  initial,
}: Pick<CardEditorPanelProps, "editor" | "initial">) {
  const [mapOpen, setMapOpen] = useState(false);
  const {
    address,
    callerPhone,
    form,
    labels,
    location,
    person,
    phoneRef,
    setAddress,
    setPerson,
    silent,
  } = editor;
  return (
    <>
      <h4>Заявитель и содержание обращения</h4>
      <div className="template-input-grid">
        <CardEditorTextFields
          editor={editor}
          initial={initial}
          fields={["caller_name"]}
        />
        <TextField
          name="data.caller_phone"
          label={labels.caller_phone}
          type="tel"
          autoComplete="off"
          placeholder="+7 900 123-45-67"
          value={form.caller_phone}
          onChange={callerPhone.inputProps.onChange}
          onBlur={callerPhone.inputProps.onBlur}
          inputRef={phoneRef}
          error={callerPhone.issue !== null}
          helperText={callerPhone.issue?.message}
          slotProps={{ htmlInput: { inputMode: "tel", spellCheck: false } }}
        />
      </div>
      <CardEditorTextFields
        editor={editor}
        initial={initial}
        fields={["description"]}
      />
      <Alert severity="info">
        Параметры человека необязательны. Укажите существенные сведения также в
        сообщении заявителя, чтобы ученик не оценивался по скрытым фактам.
      </Alert>
      <Stack direction="row" spacing={1}>
        {(
          [
            ["gender", "Пол"],
            ["age", "Возраст"],
            ["height_cm", "Рост, см"],
            ["weight_kg", "Вес, кг"],
          ] as const
        ).map(([key, label]) => (
          <TextField
            key={key}
            name={`data.person.${key}`}
            label={label}
            type={key === "gender" ? "text" : "number"}
            disabled={silent}
            value={person[key]}
            onChange={(event) =>
              setPerson({ ...person, [key]: event.target.value })
            }
            slotProps={{
              htmlInput: {
                min: 0,
                max: key === "age" ? 130 : 600,
                maxLength: 40,
              },
            }}
          />
        ))}
      </Stack>
      <TextField
        name="data.person.appearance"
        label="Внешность и особые приметы"
        disabled={silent}
        multiline
        value={person.appearance}
        onChange={(event) =>
          setPerson({ ...person, appearance: event.target.value })
        }
        slotProps={{ htmlInput: { maxLength: 2000 } }}
      />
      {!silent && <TemplateAddress value={address} onChange={setAddress} />}
      <CardEditorTextFields
        editor={editor}
        initial={initial}
        fields={["address_text"]}
      />
      {!silent && (
        <Stack direction="row" spacing={1}>
          <Tooltip
            title={
              location ? "Изменить точку на карте" : "Указать точку на карте"
            }
          >
            <IconButton
              type="button"
              aria-label={
                location ? "Изменить точку на карте" : "Указать точку на карте"
              }
              onClick={() => setMapOpen(true)}
            >
              <MapOutlinedIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      )}
      <DialogMap
        open={mapOpen}
        editor={editor}
        onClose={() => setMapOpen(false)}
      />
    </>
  );
}

function DialogMap({
  editor,
  onClose,
  open,
}: {
  editor: CardEditorPanelProps["editor"];
  onClose: () => void;
  open: boolean;
}) {
  const { form, location, confirmLocation, structuredAddress } = editor;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle id="template-card-map-title">Карта происшествия</DialogTitle>
      <DialogContent>
        <LocationPicker
          initial={location}
          initialAddress={structuredAddress || form.address_text}
          onConfirm={({ point, address: found }) => {
            confirmLocation({ point, address: found });
            onClose();
          }}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
