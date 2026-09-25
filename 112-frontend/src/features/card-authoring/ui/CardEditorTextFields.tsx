import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";

import type { CardEditorTextFieldsProps } from "../types/CardEditorPanels";

export function CardEditorTextFields({
  editor,
  fields,
  initial,
}: CardEditorTextFieldsProps) {
  const {
    form,
    labels,
    notificationRequired,
    setForm,
    silent,
    structuredAddress,
  } = editor;
  return Object.entries(labels)
    .filter(([key]) => fields.includes(key))
    .map(([key, label]) => (
      <TextField
        key={key}
        name={
          ["title", "caller_message", "instructions"].includes(key)
            ? key
            : `data.${key}`
        }
        label={label}
        disabled={silent && ["caller_name", "address_text"].includes(key)}
        required={
          !(key === "address_text" && (!notificationRequired || silent)) &&
          !(key === "caller_message" && initial) &&
          ["title", "caller_message", "address_text", "description"].includes(
            key,
          )
        }
        multiline={["caller_message", "instructions", "description"].includes(
          key,
        )}
        minRows={key === "caller_message" ? 3 : 1}
        value={
          key === "address_text"
            ? structuredAddress || form.address_text
            : form[key as keyof typeof form]
        }
        slotProps={{
          input: { readOnly: key === "address_text" && !!structuredAddress },
        }}
        helperText={
          key === "address_text" && structuredAddress
            ? "Собран из отдельных полей адреса ниже."
            : undefined
        }
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
      />
    ));
}
