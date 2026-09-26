import { crewStatusLabels } from "@/entities/training";
import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import { Button, MenuItem, Paper, Stack, Typography } from "@mui/material";
import type { DDSCrewExerciseFieldsProps } from "../types/CardDDSSettings";
import { ddsEditorStyles as styles } from "../styles/CardDDSSettings";

export function DDSCrewExerciseFields({
  crew,
  value,
  onChange,
}: DDSCrewExerciseFieldsProps) {
  const initialIndex = value.initial_crews.findIndex(
    (c) => c.crew_code === crew.code,
  );
  const history = value.initial_crews[initialIndex]?.history ?? [];
  const goalIndex = value.required_crews.findIndex(
    (g) => g.crew_code === crew.code,
  );
  const goal = value.required_crews[goalIndex]?.status ?? "";
  const messageIndex = value.messages.findIndex(
    (m) => m.crew_code === crew.code,
  );
  const message = value.messages
    .filter((m) => m.crew_code === crew.code)
    .map((m) => m.message)
    .join("\n\n");
  const setHistory = (next: typeof history) =>
    onChange({
      ...value,
      initial_crews: [
        ...value.initial_crews.filter((c) => c.crew_code !== crew.code),
        ...(next.length ? [{ crew_code: crew.code, history: next }] : []),
      ],
    });
  return (
    <Paper variant="outlined" sx={styles.crew}>
      <Stack spacing={2}>
        <Typography component="h3" variant="subtitle1">
          {crew.name}
        </Typography>
        <Typography variant="body2">
          {history.length
            ? "Продолжение работы: история до начала занятия"
            : "Новая работа: бригада ещё не назначена"}
        </Typography>
        {history.map((event, i) => (
          <Paper key={i} variant="outlined" sx={styles.history}>
            <Stack spacing={1}>
              <Stack direction="row" sx={styles.row}>
                <TextField
                  sx={styles.field}
                  select
                  label={`Исходный статус ${i + 1}`}
                  value={event.status}
                  onChange={(e) =>
                    setHistory(
                      history.map((h, j) =>
                        j === i ? { ...h, status: e.target.value } : h,
                      ),
                    )
                  }
                >
                  {Object.entries(crewStatusLabels).map(([key, label]) => (
                    <MenuItem key={key} value={key}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  sx={styles.field}
                  required
                  type="number"
                  name={`dds_exercise.initial_crews.${initialIndex}.history.${i}.seconds_before_start`}
                  label="Минут до поступления карточки"
                  value={event.seconds_before_start / 60}
                  slotProps={{ htmlInput: { min: 0, max: 1440, step: 1 } }}
                  onChange={(e) =>
                    setHistory(
                      history.map((h, j) =>
                        j === i
                          ? {
                              ...h,
                              seconds_before_start: Number(e.target.value) * 60,
                            }
                          : h,
                      ),
                    )
                  }
                />
                <Button
                  onClick={() => setHistory(history.filter((_, j) => i !== j))}
                >
                  Удалить запись
                </Button>
              </Stack>
              <TextField
                label="Номер наряда"
                value={event.crew_number ?? ""}
                onChange={(e) =>
                  setHistory(
                    history.map((h, j) =>
                      j === i
                        ? { ...h, crew_number: e.target.value || null }
                        : h,
                    ),
                  )
                }
              />
              <TextField
                label="Комментарий в исходной истории"
                multiline
                value={event.comment}
                onChange={(e) =>
                  setHistory(
                    history.map((h, j) =>
                      j === i ? { ...h, comment: e.target.value } : h,
                    ),
                  )
                }
              />
            </Stack>
          </Paper>
        ))}
        <Button
          disabled={history.length >= 30}
          onClick={() =>
            setHistory([
              ...history,
              {
                status: history.length ? "responding" : "assigned",
                seconds_before_start:
                  history.at(-1)?.seconds_before_start ?? 5 * 60,
                comment: "",
                crew_number: history.at(-1)?.crew_number ?? null,
              },
            ])
          }
        >
          Добавить исходную запись
        </Button>
        <TextField
          select
          label="Учебная цель после начала занятия"
          value={goal}
          onChange={(e) =>
            onChange({
              ...value,
              required_crews: [
                ...value.required_crews.filter(
                  (g) => g.crew_code !== crew.code,
                ),
                ...(e.target.value
                  ? [{ crew_code: crew.code, status: e.target.value }]
                  : []),
              ],
              messages: [
                ...value.messages.filter((m) => m.crew_code !== crew.code),
                ...(e.target.value ? [{ crew_code: crew.code, message }] : []),
              ],
            })
          }
        >
          <MenuItem value="">
            Только исходная история, без учебной цели
          </MenuItem>
          {Object.entries(crewStatusLabels).map(([key, label]) => (
            <MenuItem key={key} value={key}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        {goal && (
          <TextField
            required
            multiline
            minRows={2}
            name={`dds_exercise.messages.${messageIndex}.message`}
            label="Новое сообщение для ученика"
            helperText="Например: «Расчёт прибыл по адресу, приступает к работе». Сообщение появится у бригады, но не изменит её статус автоматически."
            value={message}
            onChange={(e) =>
              onChange({
                ...value,
                messages: [
                  ...value.messages.filter((m) => m.crew_code !== crew.code),
                  { crew_code: crew.code, message: e.target.value },
                ],
              })
            }
          />
        )}
      </Stack>
    </Paper>
  );
}
