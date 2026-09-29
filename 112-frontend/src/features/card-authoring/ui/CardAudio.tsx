import { Button, Stack, Typography } from "@mui/material";
import { RecordingPicker, RecordingSummary } from "@/entities/recording";
import { ValidationField } from "@/shared/ui/form-validation";
import type { CardAudioProps } from "../types/CardAudio";
import { CrewVoicePicker } from "./CrewVoicePicker";
import { useState } from "react";
import { SpeechDialog } from "./SpeechDialog";

export function CardAudio({
  value,
  onChange,
  kind,
  initialText,
}: CardAudioProps) {
  const [speechOpen, setSpeechOpen] = useState(false);
  const count =
    kind === "caller" ? value.caller_ids.length : value.crew_variants.length;
  return (
    <ValidationField name="audio" label="Записи звонка">
      <Stack spacing={2}>
        <Typography variant="h6" component="h3">
          {kind === "caller"
            ? "Записи заявителя"
            : "Голоса руководителей бригад"}
        </Typography>
        <Typography variant="body2">
          {kind === "caller"
            ? "Все варианты должны передавать те же сведения, что сообщение заявителя. Различаться могут голос и формулировки."
            : "Один вариант — приветствие и подтверждение одним голосом. Между ними ученик передаёт сообщение бригаде. Без своих записей используются готовые голоса."}{" "}
          Один из вариантов выбирается случайно и сохраняется на время попытки.
        </Typography>
        {kind === "caller"
          ? value.caller_ids.map((id) => (
              <Stack key={id} spacing={1}>
                <RecordingSummary id={id} />
                {onChange && (
                  <Button
                    onClick={() =>
                      onChange({
                        ...value,
                        caller_ids: value.caller_ids.filter((i) => i !== id),
                      })
                    }
                  >
                    Убрать вариант
                  </Button>
                )}
              </Stack>
            ))
          : value.crew_variants.map((pair, index) => (
              <Stack
                key={`${pair.greeting_id}:${pair.acknowledgment_id}`}
                spacing={1}
              >
                <Typography component="h4">Голос {index + 1}</Typography>
                <RecordingSummary id={pair.greeting_id} />
                <RecordingSummary id={pair.acknowledgment_id} />
                {onChange && (
                  <Button
                    onClick={() =>
                      onChange({
                        ...value,
                        crew_variants: value.crew_variants.filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  >
                    Убрать голос
                  </Button>
                )}
              </Stack>
            ))}
        {!count && (
          <Typography variant="body2">
            {kind === "caller"
              ? "Свои записи ещё не выбраны."
              : "Используются готовые голоса."}
          </Typography>
        )}
        {onChange && count < 10 && (
          <>
            <Button variant="outlined" onClick={() => setSpeechOpen(true)}>
              {kind === "caller"
                ? "Озвучить текст заявителя"
                : "Создать голос бригады из текста"}
            </Button>
            {speechOpen && (
              <SpeechDialog
                kind={kind}
                initialText={initialText}
                onClose={() => setSpeechOpen(false)}
                onAdd={(recordings) => {
                  if (kind === "caller")
                    onChange({
                      ...value,
                      caller_ids: [
                        ...new Set([...value.caller_ids, recordings[0].id]),
                      ],
                    });
                  else
                    onChange({
                      ...value,
                      crew_variants: [
                        ...value.crew_variants,
                        {
                          greeting_id: recordings.find(
                            (r) => r.purpose === "greeting",
                          )!.id,
                          acknowledgment_id: recordings.find(
                            (r) => r.purpose === "acknowledgment",
                          )!.id,
                        },
                      ],
                    });
                }}
              />
            )}
            <Typography variant="body2">
              WAV, моно, 8000 Гц, 16 бит; до 1 МБ на файл.
              {kind === "crew"
                ? " Каждая реплика — до 20 секунд."
                : " Примерно до 65 секунд."}{" "}
              Загруженная запись остаётся в библиотеке, даже если вы отмените
              редактирование карточки.
            </Typography>
            {kind === "caller" ? (
              <RecordingPicker
                purpose="caller"
                label="Добавить запись заявителя"
                value={null}
                onChange={(id) => {
                  if (id && !value.caller_ids.includes(id))
                    onChange({
                      ...value,
                      caller_ids: [...value.caller_ids, id],
                    });
                }}
              />
            ) : (
              <CrewVoicePicker
                onAdd={(pair) => {
                  if (
                    !value.crew_variants.some(
                      (p) =>
                        p.greeting_id === pair.greeting_id &&
                        p.acknowledgment_id === pair.acknowledgment_id,
                    )
                  )
                    onChange({
                      ...value,
                      crew_variants: [...value.crew_variants, pair],
                    });
                }}
              />
            )}
          </>
        )}
        {onChange && count === 10 && (
          <Typography>Выбрано максимум 10 вариантов.</Typography>
        )}
      </Stack>
    </ValidationField>
  );
}
