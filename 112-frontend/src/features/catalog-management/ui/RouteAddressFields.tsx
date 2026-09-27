import { Button, Stack, Typography } from "@mui/material";
import {
  ValidationField,
  ValidatedTextField as TextField,
} from "@/shared/ui/form-validation";
import { styles } from "../styles/RouteAddressFields";
import type { RouteAddressFieldsProps } from "../types/RouteAddressFields";

const fields = {
  country: "Страна",
  region: "Субъект",
  locality: "Населённый пункт",
  district: "Округ",
  area: "Район",
  street: "Улица",
  house: "Дом",
  building: "Корпус",
  structure: "Строение",
  object: "Объект",
};

export function RouteAddressFields({
  name,
  editable,
  value,
  onChange,
}: RouteAddressFieldsProps) {
  return (
    <Stack spacing={1}>
      <Typography>Территория обслуживания</Typography>
      <Typography variant="body2">
        Без ограничений — любой адрес. Внутри варианта должны совпасть все
        заполненные части; достаточно одного варианта. Общие службы сохраняются,
        территориальные добавляются. Используйте проверенные адреса.
      </Typography>
      {value.map((group, i) => (
        <ValidationField
          key={i}
          name={`${name}.${i}`}
          label={`Вариант адреса ${i + 1}`}
        >
          <Stack spacing={1}>
            <Typography variant="subtitle2">Вариант адреса {i + 1}</Typography>
            <Stack sx={styles.fields}>
              {Object.entries(fields).map(([key, label]) => (
                <TextField
                  key={key}
                  disabled={!editable}
                  name={`${name}.${i}.${key}`}
                  label={label}
                  value={group[key] ?? ""}
                  slotProps={{ htmlInput: { maxLength: 255 } }}
                  onChange={(e) => {
                    const next = { ...group };
                    if (e.target.value) next[key] = e.target.value;
                    else delete next[key];
                    onChange(value.map((g, n) => (n === i ? next : g)));
                  }}
                />
              ))}
            </Stack>
            <Button
              disabled={!editable}
              onClick={() => onChange(value.filter((_, n) => n !== i))}
            >
              Убрать вариант адреса
            </Button>
          </Stack>
        </ValidationField>
      ))}
      <Button
        disabled={!editable || value.length >= 100}
        onClick={() => onChange([...value, {}])}
      >
        Добавить адресное условие
      </Button>
    </Stack>
  );
}
