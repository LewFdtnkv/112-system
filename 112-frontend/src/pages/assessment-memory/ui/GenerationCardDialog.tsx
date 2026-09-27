import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
} from "@mui/material";
import { cardQueryOptions } from "@/entities/training";
import { CardDetails } from "@/features/card-authoring";
import { GenerationExample } from "@/features/card-generation";
import { TrainingCardPreview } from "@/widgets/incident-card";
import { QueryState } from "@/shared/ui/QueryState";
import type { GenerationCardDialogProps } from "../types/generationMemory";

export function GenerationCardDialog({
  id,
  onClose,
}: GenerationCardDialogProps) {
  const detail = useQuery(cardQueryOptions(id));
  const [preview, setPreview] = useState(false);
  return (
    <>
      <Dialog
        open
        onClose={onClose}
        fullWidth
        maxWidth="lg"
        aria-labelledby="generation-memory-card-title"
      >
        <DialogTitle id="generation-memory-card-title">
          {detail.data?.title ?? "Пример для генерации"}
        </DialogTitle>
        <DialogContent>
          <QueryState
            pending={detail.isPending}
            error={detail.error}
            retry={() => void detail.refetch()}
          >
            {detail.data && (
              <Stack spacing={2}>
                <GenerationExample card={detail.data} />
                <CardDetails
                  card={detail.data}
                  onPreview={() => setPreview(true)}
                />
              </Stack>
            )}
          </QueryState>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Закрыть</Button>
        </DialogActions>
      </Dialog>
      {preview && detail.data && (
        <TrainingCardPreview
          reference={detail.data}
          onClose={() => setPreview(false)}
        />
      )}
    </>
  );
}
