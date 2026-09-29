import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import type { GenerationParameters } from "@/entities/training";
import { Autocomplete } from "@mui/material";
import type { GenerationTextChoiceProps } from "../types/CardGenerationPanels";

export function GenerationTextChoice({
  model,
  name,
  label,
  values,
}: GenerationTextChoiceProps) {
  const disabled =
    (name === "caller_name" && model.p.caller_information === "anonymous") ||
    (name === "house" &&
      (model.p.address_format === "descriptive" ||
        !!model.p.address_description));
  const change = (value: string | null) =>
    model.change({ [name]: value } as Partial<GenerationParameters>);
  return (
    <Autocomplete
      disabled={disabled}
      freeSolo
      options={["Случайно", ...values]}
      value={(model.p[name] as string | null | undefined) ?? "Случайно"}
      onChange={(_, value) =>
        change(!value || value === "Случайно" ? null : value)
      }
      onInputChange={(_, value, reason) => {
        if (reason === "input") change(value || null);
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          name={`parameters.${name}`}
          label={label}
          helperText="Выберите или введите своё значение"
        />
      )}
    />
  );
}
