import { ValidatedForm } from "@/shared/ui/form-validation";
import { QueryState } from "@/shared/ui/QueryState";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import { useCardGeneration } from "../model/useCardGeneration";
import "../styles/generation.scss";
import type { CardGenerationDialogProps } from "../types/CardGenerationDialog";
import { GenerationDetails } from "./GenerationDetails";
import { GenerationFeatureFields } from "./GenerationFeatureFields";
import { GenerationSetup } from "./GenerationSetup";

/** Coordinates the generation dialog; each form section owns its own controls. */
export function CardGenerationDialog({ onClose }: CardGenerationDialogProps) {
  const model = useCardGeneration({ onClose });
  const { options, save } = model;
  return (
    <Dialog
      open
      onClose={save.isPending ? undefined : onClose}
      maxWidth="lg"
      fullWidth
      aria-labelledby="generation-title"
    >
      <DialogTitle id="generation-title">Сгенерировать карточки</DialogTitle>
      <DialogContent>
        <ValidatedForm
          id="card-generation-form"
          error={save.error}
          onSubmit={() => save.mutate()}
        >
          <QueryState
            pending={options.isPending}
            error={options.error}
            retry={() => void options.refetch()}
          >
            {options.data && (
              <fieldset className="generation-form" disabled={save.isPending}>
                <GenerationSetup model={model} />
                <GenerationFeatureFields model={model} />
                <GenerationDetails model={model} />
              </fieldset>
            )}
          </QueryState>
        </ValidatedForm>
      </DialogContent>
      <DialogActions>
        <Button disabled={save.isPending} onClick={onClose}>
          Отмена
        </Button>
        <Button
          variant="contained"
          disabled={!options.data || save.isPending}
          type="submit"
          form="card-generation-form"
        >
          {save.isPending ? "Регистрация…" : "Запустить генерацию"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
