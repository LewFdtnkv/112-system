import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import CloseIcon from "@mui/icons-material/Close";
import { IconButton, InputAdornment } from "@mui/material";
import { useRef } from "react";
import type { DateTimeFieldProps } from "../types/DateTimeField";

export function DateTimeField({
  label,
  name,
  value,
  onChange,
  helperText,
  min,
  disabled,
}: DateTimeFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <TextField
      label={label}
      name={name}
      type="datetime-local"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      inputRef={input}
      disabled={disabled}
      helperText={helperText}
      slotProps={{
        inputLabel: { shrink: true },
        htmlInput: { min },
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                type="button"
                size="small"
                disabled={disabled}
                aria-label={`Очистить: ${label}`}
                title="Очистить дату и время"
                onClick={() => {
                  // A partially entered native date has an empty value but visible segments.
                  if (input.current) input.current.value = "";
                  onChange("");
                  input.current?.focus();
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
