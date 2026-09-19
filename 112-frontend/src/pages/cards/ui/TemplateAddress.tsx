import { Stack, TextField, Typography } from "@mui/material";
import type { IncidentAddress } from "@/entities/incident-card";

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
export function TemplateAddress({
  value,
  onChange,
}: {
  value: IncidentAddress;
  onChange: (value: IncidentAddress) => void;
}) {
  return (
    <Stack spacing={1}>
      <Typography component="h3" variant="subtitle1">
        Поля эталонного адреса
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Заполняйте только известные из условия сведения. Пустые поля не
        участвуют в автопроверке. Для адреса без улицы и дома используйте строку
        «Эталонный адрес».
      </Typography>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 12,
        }}
      >
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
