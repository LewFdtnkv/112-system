import { ValidationField } from "@/shared/ui/form-validation";
import { Button, Stack } from "@mui/material";
import { useForm, useWatch, Controller } from "react-hook-form";
import { RecordingPicker, type CardAudio } from "@/entities/recording";

export function CrewVoicePicker({
  onAdd,
}: {
  onAdd: (pair: CardAudio["crew_variants"][number]) => void;
}) {
  const form = useForm({
    defaultValues: { greeting_id: "", acknowledgment_id: "" },
  });
  const pair = useWatch({ control: form.control });
  return (
    <ValidationField
      name="audio.crew_draft"
      label="Новый голос бригады"
      validate={() =>
        pair.greeting_id || pair.acknowledgment_id
          ? "Нажмите «Добавить голос» или очистите выбранные реплики."
          : undefined
      }
    >
      <Stack spacing={1}>
        <Controller
          name="greeting_id"
          control={form.control}
          render={({ field }) => (
            <RecordingPicker
              purpose="greeting"
              label="Приветствие бригады"
              value={field.value || null}
              onChange={(id) => field.onChange(id ?? "")}
            />
          )}
        />
        <Controller
          name="acknowledgment_id"
          control={form.control}
          render={({ field }) => (
            <RecordingPicker
              purpose="acknowledgment"
              label="Подтверждение бригады"
              value={field.value || null}
              onChange={(id) => field.onChange(id ?? "")}
            />
          )}
        />
        <Button
          disabled={!pair.greeting_id || !pair.acknowledgment_id}
          onClick={() => {
            onAdd({
              greeting_id: pair.greeting_id!,
              acknowledgment_id: pair.acknowledgment_id!,
            });
            form.reset();
          }}
        >
          Добавить голос
        </Button>
      </Stack>
    </ValidationField>
  );
}
