import { ScenarioCardRecordings } from "./ScenarioCardRecordings";
import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import { cardKeys, cardApi } from "@/entities/training";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import { Button, Paper, Stack, Typography } from "@mui/material";
import { styles } from "../styles/ScenarioEditorPage";
import type { ScenarioCardsFieldsProps } from "../types/ScenarioEditorPage";

export function ScenarioCardsFields({
  role,
  profileId,
  cards,
  delays,
  offsets,
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
        queryKey={[...cardKeys.options, role, profileId]}
        key={cards.length}
        value={null}
        disabled={cards.length >= 100}
        onChange={(card) => {
          if (card) onAdd(card);
        }}
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
      {cards.length >= 100 && (
        <Typography variant="body2">
          В сценарий можно добавить не более 100 карточек.
        </Typography>
      )}
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
          <ScenarioCardRecordings id={card.id} role={role} />
          {role === "dds" && (
            <TextField
              name={`arrival_offsets_seconds.${index}`}
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
