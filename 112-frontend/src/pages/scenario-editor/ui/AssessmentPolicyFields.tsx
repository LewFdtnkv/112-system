import { Stack, TextField, Typography } from "@mui/material";
import type { AssessmentPolicy } from "@/entities/training";

export function AssessmentPolicyFields({
  value,
  onChange,
}: {
  value: AssessmentPolicy;
  onChange: (value: AssessmentPolicy) => void;
}) {
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
      <Stack spacing={2} sx={{ pt: 2 }}>
        <Typography variant="body2">
          После сдачи оценка публикуется автоматически. Веса групп нормируются
          по доступным эталонам; поля внутри группы равнозначны. Тексты пока не
          входят в балл. Это учебная настройка, которую можно изменить для новой
          версии сценария.
        </Typography>
        <Stack
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 2,
          }}
        >
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
