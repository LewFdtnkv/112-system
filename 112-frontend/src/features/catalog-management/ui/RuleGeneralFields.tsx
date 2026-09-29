import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import { Alert, Checkbox, FormControlLabel } from "@mui/material";
import type { RuleGeneralFieldsProps } from "../types/RuleFormEditors";

const labels = {
  code: "Код происшествия",
  section: "Раздел",
  name: "Название происшествия",
  response_scenario: "Сценарий реагирования",
};

export function RuleGeneralFields({ form, onChange }: RuleGeneralFieldsProps) {
  return (
    <>
      {(["code", "section", "name", "response_scenario"] as const).map(
        (key) => (
          <TextField
            name={`entry.${key}`}
            key={key}
            required={key !== "response_scenario"}
            label={labels[key]}
            value={form[key] ?? ""}
            onChange={(event) =>
              onChange({ ...form, [key]: event.target.value })
            }
          />
        ),
      )}
      <TextField
        name="entry.display_name"
        label="Короткое название для ученика"
        value={form.display_name ?? ""}
        helperText="Без технического кода. Если не заполнено, используется название происшествия."
        slotProps={{ htmlInput: { maxLength: 100 } }}
        onChange={(event) =>
          onChange({ ...form, display_name: event.target.value || null })
        }
      />
      <FormControlLabel
        label="Популярный тип — показывать быструю кнопку"
        control={
          <Checkbox
            checked={form.is_popular ?? false}
            onChange={(_, is_popular) => onChange({ ...form, is_popular })}
          />
        }
      />
      {form.is_popular && (
        <TextField
          name="entry.popular_order"
          label="Порядок быстрой кнопки"
          type="number"
          helperText="Меньшее число — раньше. Ученик видит до 11 популярных типов."
          slotProps={{ htmlInput: { min: 0, max: 10000 } }}
          value={form.popular_order ?? 0}
          onChange={(event) =>
            onChange({ ...form, popular_order: Number(event.target.value) })
          }
        />
      )}
      <FormControlLabel
        label="Требуется оповещение служб"
        control={
          <Checkbox
            checked={form.notification_required !== false}
            onChange={(_, notification_required) =>
              onChange({
                ...form,
                notification_required,
                routes: notification_required ? form.routes : [],
              })
            }
          />
        }
      />
      {form.notification_required === false && (
        <Alert severity="info">
          Служебное обращение: регистрация без оповещения. Маршруты служб не
          задаются.
        </Alert>
      )}
    </>
  );
}
