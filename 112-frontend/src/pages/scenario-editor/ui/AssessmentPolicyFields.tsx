import { Stack, TextField, Typography } from "@mui/material";
import { styles } from "../styles/AssessmentPolicyFields";
import type { AssessmentPolicyFieldsProps } from "../types/AssessmentPolicyFields";

export function AssessmentPolicyFields({
  value,
  onChange,
}: AssessmentPolicyFieldsProps) {
  const labels = {
    classification: "Тип происшествия",
    notification: "Оповещение служб",
    address: "Адрес",
    caller: "Заявитель",
    victims: "Пострадавшие",
  };
  return (
    <details>
      <summary>Автоматическая оценка — веса критериев</summary>
      <Stack spacing={2} sx={styles.stack}>
        <Typography variant="body2">
          После сдачи оценка публикуется автоматически. Веса групп нормируются
          по доступным эталонам; поля внутри группы равнозначны. Тексты пока не
          входят в балл. Это учебная настройка, которую можно изменить для новой
          версии сценария.
        </Typography>
        <Stack sx={styles.stack2}>
          {Object.entries(labels).map(([code, label]) => (
            <TextField
              key={code}
              type="number"
              fullWidth
              label={`Вес: ${label}`}
              required
              value={value.weights[code as keyof typeof labels]}
              slotProps={{ htmlInput: { min: 1, max: 100, step: 1 } }}
              onChange={(e) =>
                onChange({
                  ...value,
                  weights: { ...value.weights, [code]: Number(e.target.value) },
                })
              }
            />
          ))}
        </Stack>
      </Stack>
    </details>
  );
}
