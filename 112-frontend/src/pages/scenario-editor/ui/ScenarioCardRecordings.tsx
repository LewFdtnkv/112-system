import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cardApi, cardKeys } from "@/entities/training";
import { RecordingSummary } from "@/entities/recording";
import { Alert, Button, Stack, Typography } from "@mui/material";

export function ScenarioCardRecordings({
  id,
  role,
}: {
  id: string;
  role: string;
}) {
  const [open, setOpen] = useState(false);
  const card = useQuery({
    queryKey: cardKeys.detail(id),
    enabled: open,
    queryFn: ({ signal }) => cardApi.card(id, signal),
  });
  const audio = card.data?.audio;
  const ids =
    role === "dds"
      ? (audio?.crew_variants.flatMap((p) => [
          p.greeting_id,
          p.acknowledgment_id,
        ]) ?? [])
      : (audio?.caller_ids ?? []);
  return (
    <Stack spacing={1}>
      <Button onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Скрыть записи" : "Записи карточки"}
      </Button>
      {open && (
        <>
          {card.error && (
            <Alert severity="error">
              Не удалось загрузить записи карточки.
            </Alert>
          )}
          {card.isPending && <Typography>Загрузка записей…</Typography>}
          {card.data && !ids.length && (
            <Typography variant="body2">
              {role === "dds"
                ? "Свои голоса не выбраны. Для обязательного звонка используются готовые голоса."
                : "Свои записи заявителя не выбраны."}
            </Typography>
          )}
          {ids.length > 0 && (
            <Typography variant="body2">
              Вариантов: {role === "dds" ? ids.length / 2 : ids.length}. Записи
              сохранятся в новой версии сценария.
            </Typography>
          )}
          {[...new Set(ids)].map((recordingId) => (
            <RecordingSummary key={recordingId} id={recordingId} />
          ))}
        </>
      )}
    </Stack>
  );
}
