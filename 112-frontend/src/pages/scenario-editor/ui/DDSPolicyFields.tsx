import { ddsStatusLabels } from "@/entities/training";
import {
  Alert,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
} from "@mui/material";
import { styles } from "../styles/DDSPolicyFields";
import type { DDSPolicyFieldsProps } from "../types/DDSPolicyFields";
export function DDSPolicyFields({ value, onChange }: DDSPolicyFieldsProps) {
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Последний этап определяет цель упражнения. На каждом этапе ученик
        получает сообщение и фиксирует решение. Номер наряда для проверки должен
        быть указан в сообщении. Звонки пока не подключены.
      </Alert>
      {value.steps.map((step, i) => (
        <Paper key={i} sx={styles.paper}>
          <Stack spacing={1}>
            <b>Этап {i + 1}</b>
            <TextField
              select
              label={`Ожидаемый статус этапа ${i + 1}`}
              value={step.status}
              onChange={(e) =>
                onChange({
                  steps: value.steps.map((s, j) =>
                    j === i ? { ...s, status: e.target.value } : s,
                  ),
                })
              }
            >
              {Object.entries(ddsStatusLabels)
                .filter(([k]) => k !== "received")
                .map(([k, label]) => (
                  <MenuItem value={k} key={k}>
                    {label}
                  </MenuItem>
                ))}
            </TextField>
            <TextField
              required
              multiline
              minRows={2}
              label={`Сообщение ученику на этапе ${i + 1}`}
              value={step.message}
              onChange={(e) =>
                onChange({
                  steps: value.steps.map((s, j) =>
                    j === i ? { ...s, message: e.target.value } : s,
                  ),
                })
              }
            />
            <TextField
              label={`Эталонный номер наряда на этапе ${i + 1}`}
              value={step.crew_number ?? ""}
              onChange={(e) =>
                onChange({
                  steps: value.steps.map((s, j) =>
                    j === i ? { ...s, crew_number: e.target.value || null } : s,
                  ),
                })
              }
            />
            <Button
              disabled={value.steps.length === 1}
              onClick={() =>
                onChange({ steps: value.steps.filter((_, j) => j !== i) })
              }
            >
              Удалить этап
            </Button>
          </Stack>
        </Paper>
      ))}
      <Button
        disabled={value.steps.length >= 7}
        onClick={() =>
          onChange({
            steps: [
              ...value.steps,
              { status: "completed", message: "", crew_number: null },
            ],
          })
        }
      >
        Добавить этап ДДС
      </Button>
    </Stack>
  );
}
