import { Stack, TextField, Typography } from "@mui/material";
import { styles } from "../styles/TemplateAddress";
import type { TemplateAddressProps } from "../types/TemplateAddress";

const fields = {
  locality: "Населённый пункт",
  street: "Улица",
  house: "Дом",
  building: "Корпус",
  structure: "Строение",
  apartment: "Квартира / офис",
  entrance: "Подъезд",
  floor: "Этаж",
} as const;
export function TemplateAddress({ value, onChange }: TemplateAddressProps) {
  return (
    <Stack spacing={1}>
      <Typography component="h3" variant="subtitle1">
        Адрес происшествия
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Заполняйте только известные из условия сведения. Пустые поля не
        участвуют в автопроверке. Для адреса без улицы и дома используйте строку
        «Адрес целиком».
      </Typography>
      <div style={styles.div}>
        {Object.entries(fields).map(([key, label]) => (
          <TextField
            key={key}
            label={label}
            value={value[key as keyof typeof fields] ?? ""}
            slotProps={{ htmlInput: { maxLength: 255 } }}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          />
        ))}
      </div>
    </Stack>
  );
}
