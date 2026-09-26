import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import { cardApi } from "@/entities/training";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import { Button, Paper, Stack, Typography } from "@mui/material";
import { styles } from "../styles/ScenarioEditorPage";
import type { ScenarioCardsFieldsProps } from "../types/ScenarioEditorPage";

export function ScenarioCardsFields({
  role,
  profileId,
  cards,
  choice,
  delays,
  offsets,
  onChoiceChange,
  onAdd,
  onRemove,
  onMove,
  onDelayChange,
}: ScenarioCardsFieldsProps) {
  return (
    <>
      <Typography variant="h6" component="h2">
        {role === "dds"
          ? "Расписание поступления карточек"
          : "Карточки по порядку выполнения"}
      </Typography>
      <ServerSelect
        label="Карточка из библиотеки"
        queryKey={["card-options", role, profileId]}
        value={choice}
        onChange={onChoiceChange}
        load={async (query, signal) =>
          (
            await cardApi.cards(
              {
                q: query,
                ...(role === "dds" && profileId
                  ? { dds_profile_id: profileId }
                  : {}),
              },
              signal,
            )
          ).items.map((card) => ({
            id: card.id,
            label: card.title,
          }))
        }
      />
      <Button disabled={!choice || cards.length >= 100} onClick={onAdd}>
        Добавить карточку
      </Button>
      {cards.map((card, index) => (
        <Paper key={index} sx={styles.paper}>
          <Stack direction="row" sx={styles.stack} spacing={1}>
            <Typography sx={styles.typography}>
              {index + 1}. {card.label}
            </Typography>
            <Button
              disabled={index === 0}
              onClick={() => onMove(index, -1)}
              aria-label={`Вверх: ${card.label}`}
            >
              ↑
            </Button>
            <Button
              disabled={index === cards.length - 1}
              onClick={() => onMove(index, 1)}
              aria-label={`Вниз: ${card.label}`}
            >
              ↓
            </Button>
            <Button onClick={() => onRemove(index)}>Убрать</Button>
          </Stack>
          {role === "dds" && (
            <TextField
              type="number"
              label={
                index === 0
                  ? "Первая карточка — сразу"
                  : "Через сколько секунд после предыдущей"
              }
              value={delays[index]}
              disabled={index === 0}
              slotProps={{ htmlInput: { min: 0, max: 86400, step: 1 } }}
              onChange={(event) =>
                onDelayChange(index, Number(event.target.value))
              }
              helperText={`Поступление через ${offsets[index]} с от старта занятия. Завершение предыдущей карточки не требуется.`}
            />
          )}
        </Paper>
      ))}
    </>
  );
}
