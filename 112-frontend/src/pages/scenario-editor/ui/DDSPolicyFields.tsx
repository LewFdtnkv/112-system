import {
  ddsStatusLabels,
  trainingApi,
  crewStatusLabels,
} from "@/entities/training";
import {
  Alert,
  Button,
  MenuItem,
  Paper,
  Stack,
  TextField,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { styles } from "../styles/DDSPolicyFields";
import type { DDSPolicyFieldsProps } from "../types/DDSPolicyFields";
export function DDSPolicyFields({
  value,
  onChange,
  profileId,
}: DDSPolicyFieldsProps) {
  const profile = useQuery({
    queryKey: ["profile", profileId],
    enabled: !!profileId,
    queryFn: ({ signal }) => trainingApi.profile(profileId!, signal),
  });
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Последний этап определяет цель упражнения. На каждом этапе ученик
        получает сообщение и фиксирует решение. Номер наряда для проверки должен
        быть указан в сообщении. Звонки пока не подключены.
      </Alert>
      {profile.error && (
        <Alert severity="error">
          Не удалось загрузить бригады профиля.{" "}
          <Button onClick={() => void profile.refetch()}>Повторить</Button>
        </Alert>
      )}
      {!!profile.data?.crews?.length && (
        <Paper sx={styles.paper}>
          <Stack spacing={1}>
            <b>Задание по бригадам</b>
            <small>
              Указанные цели видны ученику в задании и проверяются
              автоматически. Порядок работы разных бригад свободный.
            </small>
            {profile.data.crews
              .filter((c) => c.is_active)
              .map((c) => (
                <TextField
                  key={c.code}
                  select
                  label={`Цель для бригады «${c.name}»`}
                  value={
                    value.required_crews?.find((r) => r.crew_code === c.code)
                      ?.status ?? ""
                  }
                  onChange={(e) =>
                    onChange({
                      ...value,
                      required_crews: [
                        ...(value.required_crews ?? []).filter(
                          (r) => r.crew_code !== c.code,
                        ),
                        ...(e.target.value
                          ? [{ crew_code: c.code, status: e.target.value }]
                          : []),
                      ],
                    })
                  }
                >
                  <MenuItem value="">Не включать в оценку</MenuItem>
                  {Object.entries(crewStatusLabels).map(([key, label]) => (
                    <MenuItem key={key} value={key}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
              ))}
          </Stack>
        </Paper>
      )}
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
                  ...value,
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
                  ...value,
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
                  ...value,
                  steps: value.steps.map((s, j) =>
                    j === i ? { ...s, crew_number: e.target.value || null } : s,
                  ),
                })
              }
            />
            <Button
              disabled={value.steps.length === 1}
              onClick={() =>
                onChange({
                  ...value,
                  steps: value.steps.filter((_, j) => j !== i),
                })
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
            ...value,
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
