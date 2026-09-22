import {
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
} from "@mui/material";
import { styles } from "../styles/ProfileForm";
import type { ProfileCrewsProps } from "../types/ProfileCrews";

export function ProfileCrews({ value, contacts, onChange }: ProfileCrewsProps) {
  return (
    <Stack spacing={2}>
      <b>Бригады службы</b>
      <small>
        Ученик назначает бригады вручную. Изменения опубликованного профиля
        сохраняются новой версией.
      </small>
      {value.map((crew, i) => (
        <Paper key={i} sx={styles.paper}>
          <Stack spacing={1}>
            <TextField
              label={`Код бригады ${i + 1}`}
              required
              value={crew.code}
              helperText="Латинские буквы, цифры, дефис или подчёркивание"
              onChange={(e) =>
                onChange(
                  value.map((c, j) =>
                    j === i ? { ...c, code: e.target.value } : c,
                  ),
                )
              }
            />
            <TextField
              label={`Название бригады ${i + 1}`}
              required
              value={crew.name}
              onChange={(e) =>
                onChange(
                  value.map((c, j) =>
                    j === i ? { ...c, name: e.target.value } : c,
                  ),
                )
              }
            />
            <TextField
              label={`Назначение бригады ${i + 1}`}
              multiline
              value={crew.description}
              onChange={(e) =>
                onChange(
                  value.map((c, j) =>
                    j === i ? { ...c, description: e.target.value } : c,
                  ),
                )
              }
            />
            <TextField
              select
              label={`Контакт старшего бригады ${i + 1}`}
              value={crew.contact_code ?? ""}
              onChange={(e) =>
                onChange(
                  value.map((c, j) =>
                    j === i
                      ? { ...c, contact_code: e.target.value || null }
                      : c,
                  ),
                )
              }
            >
              <MenuItem value="">Без контакта</MenuItem>
              {contacts
                .filter((c) => c.code)
                .map((c) => (
                  <MenuItem key={c.code} value={c.code}>
                    {c.name || c.code}
                  </MenuItem>
                ))}
            </TextField>
            <FormControlLabel
              label="Доступна для назначения"
              control={
                <Checkbox
                  checked={crew.is_active}
                  onChange={(_, is_active) =>
                    onChange(
                      value.map((c, j) => (j === i ? { ...c, is_active } : c)),
                    )
                  }
                />
              }
            />
            <Button onClick={() => onChange(value.filter((_, j) => j !== i))}>
              Удалить бригаду {i + 1}
            </Button>
          </Stack>
        </Paper>
      ))}
      <Button
        disabled={value.length >= 100}
        onClick={() =>
          onChange([
            ...value,
            {
              code: "",
              name: "",
              description: "",
              contact_code: null,
              is_active: true,
            },
          ])
        }
      >
        Добавить бригаду
      </Button>
    </Stack>
  );
}
